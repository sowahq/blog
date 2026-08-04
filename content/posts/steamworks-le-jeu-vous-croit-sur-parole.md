---
title: "Steamworks : le jeu vous croit sur parole"
description: "Quand un jeu demande « est-ce que je possède ce DLC ? », la réponse est calculée dans son propre processus. Pas de réseau, pas de signature : un appel de vtable, et le jeu fait confiance au résultat. Pourquoi ces interfaces ne sont pas une frontière de sécurité, et quelle est la vraie contre-mesure."
pubDate: 08/05/2026
image: /blog-img/steamworks-le-jeu-vous-croit-sur-parole/header.png
tags: ["reverse engineering", "steam", "hooking", "c++"]
slug: steamworks-le-jeu-vous-croit-sur-parole
published: true
---

Vous avez déjà vu un jeu afficher « contenu additionnel non détecté » et vous êtes demandé où il allait chercher cette information ? La réponse est plus décevante qu'on ne l'imagine : il la demande à une DLL posée dans son propre dossier, et il fait confiance à ce qu'elle lui répond.

Pas de vérification en ligne, pas de signature, pas de challenge cryptographique. Un appel de fonction, une valeur de retour, et le jeu passe à autre chose.

C'est un sujet dont on parle assez peu parce qu'il n'y a rien de spectaculaire à casser — il n'y a rien de cassé, justement. Il y a une API qui fait exactement ce qu'elle documente, et des jeux qui lui font confiance pour un usage auquel elle n'a jamais prétendu servir. Voyons pourquoi.

## 1. Comment un jeu demande « est-ce que je possède ça ? »

Steamworks expose ça par deux chemins. Ce qui les distingue, ce n'est pas leur âge, c'est **d'où sort le pointeur d'interface** — et ça va tout changer pour la suite.

### 1.1 Par la factory exportée

Le cas le plus fréquent. Un jeu C++ moderne écrit simplement :

```cpp
if (SteamApps()->BIsDlcInstalled(1234560)) {
    unlock_dlc_content();
}
```

`SteamApps()` est un accesseur inline du SDK. Sous le capot, il récupère son pointeur d'interface via une fonction usine (factory) exportée par `steam_api64.dll` : `SteamInternal_FindOrCreateUserInterface`.

L'API plate — la couche C générée au-dessus des interfaces C++, celle qu'utilisent les bindings pour C#, Godot et compagnie — arrive exactement au même endroit :

```c
SteamAPI_ISteamApps_BIsDlcInstalled(SteamApps(), 1234560);
```

Même factory, même pointeur. Pour nous, c'est un seul et même chemin.

### 1.2 Par ISteamClient

L'autre voie passe par l'interface racine :

```cpp
ISteamApps* apps = SteamClient()->GetISteamApps(user, pipe, "STEAMAPPS_INTERFACE_VERSION008");
if (apps->BIsDlcInstalled(1234560)) {
    unlock_dlc_content();
}
```

Notez la différence : ici, `ISteamApps` n'est **pas** obtenu par la factory exportée. C'est `ISteamClient` qui le fabrique, en interne. Retenez ce détail, il va nous coûter deux hooks supplémentaires.

![Les deux chemins pour atteindre ISteamApps](/blog-img/steamworks-le-jeu-vous-croit-sur-parole/01-deux-chemins.png)

## 2. Le vrai problème : tout se passe chez vous

Dans les deux cas, la question et la réponse voyagent entre deux morceaux de code chargés dans **le même processus**, le vôtre. Aucun paquet réseau, aucune frontière de privilège. Juste un `call` et un `ret`.

### 2.1 Une interface Steamworks, c'est une vtable

`ISteamApps` est une classe C++ abstraite. Concrètement, en mémoire, un pointeur d'interface pointe vers une structure dont le premier champ est un pointeur vers une table de pointeurs de fonctions — la vtable.

L'appel `apps->BIsDlcInstalled(1234560)` se compile en quelque chose comme :

```asm
mov  rcx, apps            ; rcx = le pointeur d'interface (this)
mov  edx, 12D680h         ; edx = 1234560, l'app id du DLC
mov  rax, [rcx]           ; rax = la vtable
call qword ptr [rax+38h]  ; slot 7 (7 * 8 octets) = BIsDlcInstalled
```

![La vtable avant et après le hook](/blog-img/steamworks-le-jeu-vous-croit-sur-parole/02-vtable-hook.png)

Tout est là. `[rax+38h]`, c'est une case mémoire inscriptible dans notre propre processus. Si on y écrit l'adresse d'une autre fonction, le jeu appellera cette autre fonction, sans jamais s'en apercevoir. Il ne vérifie pas où pointe son slot 7 — pourquoi le ferait-il, c'est le compilateur qui a généré cet accès.

### 2.2 Le versioning, ou pourquoi les numéros de slot comptent

Petit détail qui a son importance : les index de slot dépendent de la version de l'interface. `STEAMAPPS_INTERFACE_VERSION008` et `STEAMAPPS_INTERFACE_VERSION005` n'ont pas la même disposition, parce que Valve ajoute des méthodes au fil des versions.

D'où la chaîne de version passée en paramètre aux factories. C'est aussi ce qui nous permet de savoir à quelle interface on a affaire : on nous la donne, gratuitement, à chaque appel.

## 3. Construire le shim

![Le shim dans le processus du jeu](/blog-img/steamworks-le-jeu-vous-croit-sur-parole/03-shim-en-place.png)

L'idée tient en une phrase : **se placer entre les factories et le jeu**. On laisse la vraie DLL de Valve fabriquer ses interfaces — elle fait tout le travail réel, on n'a aucune envie de la réimplémenter — et on repeint quelques slots au passage.

### 3.1 Intercepter les usines

On accroche les exports de la vraie `steam_api64.dll` avec MinHook :

```cpp
static void* (__cdecl* real_CreateInterface)(const char*) = nullptr;

static void* __cdecl my_CreateInterface(const char* version) {
    auto* iface = real_CreateInterface(version);   // la vraie usine tourne

    if (iface && version)
        on_new_interface(iface, version);          // on inspecte le résultat

    return iface;
}
```

Un détail qui n'est pas anodin : au moment où notre DLL est chargée, `steam_api64.dll` n'est peut-être pas encore mappée. L'ordre de chargement ne nous appartient pas. Et faire quoi que ce soit de sérieux depuis `DllMain` est une mauvaise idée — on y est sous le loader lock, où beaucoup d'appels Win32 se comportent mal ou se figent.

La solution la moins bête : lancer un thread qui attend l'apparition du module, avec une limite.

```cpp
static DWORD WINAPI wait_for_steam_api(LPVOID) {
    for (int i = 0; i < 200; ++i) {
        if (GetModuleHandleA("steam_api64.dll")) {
            install_hooks();
            return 0;
        }
        Sleep(50);
    }
    return 0;   // dix secondes, puis on abandonne proprement
}
```

### 3.2 Le piège de la convention d'appel

Là, on tombe sur un truc rigolo. Les méthodes d'une interface C++ sont en `__thiscall` : le pointeur `this` arrive dans un registre. Mais MinHook nous donne une adresse brute, et `__thiscall` n'est pas déclarable sur une fonction libre en C++.

Le contournement classique, c'est `__fastcall`, qui passe aussi ses premiers arguments par registre. Sauf que la disposition diffère entre x86 et x64 : en x64 le `this` est dans `RCX`, en x86 il est dans `ECX` mais `EDX` est également réservé par la convention. Il faut donc déclarer un paramètre bidon en 32 bits, et pas en 64.

Deux macros, et on n'y pense plus :

```cpp
#ifdef _WIN64
#define THISCALL(...) void* self, ##__VA_ARGS__
#define FORWARD(...)  self, ##__VA_ARGS__
#else
#define THISCALL(...) void* self, void* edx, ##__VA_ARGS__
#define FORWARD(...)  self, edx, ##__VA_ARGS__
#endif
```

### 3.3 Repeindre les slots

Le hook lui-même est d'une banalité confondante :

```cpp
static bool (__fastcall* real_BIsDlcInstalled)(THISCALL(uint32_t)) = nullptr;

static bool __fastcall my_BIsDlcInstalled(THISCALL(uint32_t app_id)) {
    if (in_unlock_list(app_id))
        return true;

    return real_BIsDlcInstalled(FORWARD(app_id));   // sinon, on laisse Steam répondre
}
```

C'est tout. Trois lignes utiles. Et notez le `return` vers l'original : on ne ment que sur ce qui est explicitement listé, le reste passe intact. Un shim qui répond `true` à tout se fait repérer immédiatement par n'importe quel jeu qui teste un app id bidon.

L'installation, elle, se fait à la volée quand une interface passe par nos factories :

```cpp
void on_new_interface(void* iface, std::string_view version) {
    if (!version.starts_with("STEAMAPPS_INTERFACE_VERSION"))
        return;

    auto** vtable = *reinterpret_cast<void***>(iface);

    MH_CreateHook(vtable[6], &my_BIsSubscribedApp, (void**)&real_BIsSubscribedApp);
    MH_CreateHook(vtable[7], &my_BIsDlcInstalled,  (void**)&real_BIsDlcInstalled);
    MH_EnableHook(MH_ALL_HOOKS);
}
```

## 4. Combien de hooks, au juste ?

Très peu, et c'est instructif de voir lesquels :

| Interface | Slot | Méthode | Rôle |
|---|---|---|---|
| `ISteamApps` | 6 | `BIsSubscribedApp` | possède-t-il l'app ? |
| `ISteamApps` | 7 | `BIsDlcInstalled` | possède-t-il le DLC ? |
| `ISteamUtils` | 9 | `GetAppID` | quel jeu croit-il être ? |
| `ISteamClient` | 9 | `GetISteamUtils` | plomberie |
| `ISteamClient` | 15 | `GetISteamApps` | plomberie |

Trois hooks font le travail. Les deux derniers ne servent qu'à rattraper le chemin de la section 1.2 — ces interfaces-là ne passent jamais par les factories, il faut les attraper à leur sortie d'usine.

C'est peu. Et c'est bien le problème : la surface à couvrir pour faire mentir un jeu sur ce qu'il possède tient en une poignée de slots.

## 5. Le même principe, partout

Deux slots dans une vtable, sur une API précise : vu comme ça, c'est anecdotique. Sauf que le schéma ne change jamais, et c'est ce qui rend le sujet intéressant. La grande majorité des cracks « classiques » reposent sur cette seule propriété.

Le motif tient en trois lignes :

1. Le programme pose une question sur ses propres droits — `BIsDlcInstalled`, `IsLicensed`, `checkActivation`, `user.isPro`, peu importe le nom.
2. La réponse est calculée dans son processus.
3. Le programme branche dessus.

Tant que ces trois lignes sont vraies, il existe un endroit unique où la réponse peut être remplacée. Tout le reste n'est qu'une affaire de granularité :

- **patcher le saut** (`jz` → `jmp`) : la plus ancienne méthode, on modifie le binaire sur disque ;
- **hooker la fonction** : on ne touche plus au fichier, on repeint un pointeur en mémoire — c'est ce qu'on vient de faire ;
- **remplacer toute la bibliothèque** : c'est le principe des émulateurs Steam, une réimplémentation de `steam_api64.dll` qui répond ce qu'on lui demande de répondre. Goldberg Emulator, le plus connu, est d'ailleurs publié en logiciel libre et sert aussi à tester un jeu en LAN sans client Steam.

Trois techniques, trois époques, une seule hypothèse cassée : que le programme puisse se croire lui-même.

L'asymétrie de coût explique le reste. Côté éditeur, produire une garantie réelle demande un serveur, une identité, un protocole, des tickets signés et une infrastructure à maintenir. Côté attaquant, il faut retourner un booléen. Il n'y a pas de rapport de force : une vérification côté client n'est jamais « un peu » contournée, elle l'est entièrement dès que quelqu'un s'y intéresse.

Et symétriquement, ce qui résiste résiste toujours pour la même raison : la réponse n'est pas produite chez le joueur, ou bien ce qui est protégé n'est pas sur sa machine. Un DLC dont les fichiers ne sont pas livrés ne se débloque pas avec un booléen — il n'y a rien à débloquer. Une logique de jeu qui vit sur un serveur autoritatif ne peut pas se mentir à elle-même.

## 6. La contre-mesure existe, et elle est documentée

Le plus amusant dans cette histoire, c'est que rien de ce que je viens de décrire n'est un secret. La documentation Steamworks de Valve dit noir sur blanc que les vérifications côté client sont indicatives et qu'il ne faut pas s'y fier pour du contrôle d'accès.

La bonne façon de faire tient en deux étapes :

1. Le client demande un ticket d'authentification (`GetAuthTicketForWebApi`) et l'envoie à **votre** serveur.
2. Votre serveur valide ce ticket auprès de la Web API Steam (`ISteamUserAuth/AuthenticateUserTicket`), puis vérifie la propriété avec `ISteamUser/CheckAppOwnership`.

![Vérification côté client contre vérification côté serveur](/blog-img/steamworks-le-jeu-vous-croit-sur-parole/04-client-vs-serveur.png)

La différence est structurelle : la réponse est produite par un serveur de Valve, signée, et consommée par un serveur à vous. Le processus du joueur n'est plus qu'un transporteur. Il peut mentir tant qu'il veut sur ce qu'il croit posséder, personne ne l'écoute.

Un shim comme celui-ci ne peut rien contre ça. Il ne casse pas de crypto — il n'y a rien à casser, il répond juste à une question qu'on lui pose gentiment.

Évidemment, ça suppose d'avoir un serveur, ce qui pour un jeu solo est une contrainte réelle. C'est tout le débat : la vérification côté client n'est pas un oubli, c'est un compromis assumé. Simplement, il faut savoir qu'on l'assume.

## 7. Et le DRM dans tout ça ?

On me posera la question, alors autant y répondre : non, ce qui précède n'a rien à voir avec le SteamStub, le wrapper de protection que Valve applique optionnellement aux exécutables.

Ce sont deux étages complètement différents. Le SteamStub, c'est un packer : il chiffre l'exécutable, ajoute une section `.bind` qui devient le point d'entrée, et déchiffre le vrai code en mémoire au lancement. Il embarque les protections habituelles de ce genre de dispositif — détection de débogueur, mesures de temps d'exécution, contrôles d'intégrité.

Sa faiblesse structurelle est celle de tous les packers de ce type, et elle est connue depuis toujours : à un instant donné, le code déchiffré est en mémoire, en clair, parce qu'il faut bien que le processeur puisse l'exécuter. Toute la protection consiste à rendre cet instant difficile à observer, pas à le supprimer.

Je m'arrête là volontairement. Décrire l'architecture d'une protection relève de l'analyse ; fournir de quoi la contourner, c'est autre chose, et ce n'est pas l'objet de ce blog. La faiblesse des vérifications côté client, elle, est documentée par l'éditeur lui-même — on est sur un tout autre terrain.

## 8. Ce qu'il faut en retenir

Une frontière de sécurité, c'est un endroit où les deux côtés ne se font pas confiance. Un appel de vtable dans votre propre processus, ce n'est pas ça. C'est un appel de fonction entre deux morceaux de code qui partagent tout : le même espace d'adressage, les mêmes droits, la même mémoire inscriptible.

Le shim ne fait rien d'astucieux. Il écrit une adresse dans une case mémoire. Ce qui rend la chose intéressante, ce n'est pas la technique, c'est ce qu'elle révèle du modèle de menace : un jeu qui vérifie ses droits côté client n'a pas une protection faible, il n'a **pas** de protection. Il a une préférence, et il espère qu'on la respecte.

Voilà, j'espère que ce tour d'horizon vous aura éclairé sur un coin de Steamworks dont on parle assez peu. Les extraits ci-dessus sont volontairement réduits à l'os : le sujet n'est pas l'outil, c'est ce que son existence dit de l'API.
