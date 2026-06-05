# Rapport de Lab — Bypass de Root Detection avec Frida

**Auteur :** Maryam IKHERAZEN  
**Date :** 05 juin 2026  
**Environnement :** Windows 11 — Genymotion Android 9.0 (Pie) x86 — Frida 17.10.1  
**App cible :** RootBeer Sample — `com.scottyab.rootbeer.sample`

> ⚠️ **Avertissement éthique :** Ces techniques sont utilisées uniquement dans un cadre pédagogique sur un appareil et une application pour lesquels une autorisation explicite a été obtenue.

---

## Sommaire

1. [Prérequis et environnement](#1-prérequis-et-environnement)
2. [Livrable 1 — Installation et preuve](#2-livrable-1--installation-et-preuve-20-pts)
3. [Livrable 2 — Déploiement et visibilité](#3-livrable-2--déploiement-et-visibilité-30-pts)
4. [Livrable 3 — Bypass Java](#4-livrable-3--bypass-java-30-pts)
5. [Livrable 4 — Natif et Trace](#5-livrable-4--natiftrace-20-pts)
6. [Conclusion](#6-conclusion)

---

## 1. Prérequis et environnement

| Composant | Détail |
|---|---|
| OS hôte | Windows 11 |
| Émulateur | Genymotion — Android 9.0 (Pie) API 28 x86 |
| Adresse ADB | 192.168.206.103:5555 |
| Python | 3.11 |
| Frida client | 17.10.1 |
| frida-server | frida-server-17.10.1-android-x86 |
| App cible | RootBeer Sample v0.9 |
| Package | com.scottyab.rootbeer.sample |

### Installation de l'app cible

```powershell
# Téléchargement de RootBeer Sample APK
# (téléchargé manuellement depuis APKPure)

adb install C:\frida-lab\RootBeer.apk
# Performing Streamed Install
# Success
```

Vérification de la présence de l'app :

```
frida-ps -Uai | findstr -i root
   -  RootBeer Sample       com.scottyab.rootbeer.sample
```

---

## 2. Installation et preuve 

> 📌 **Note :** L'installation complète de Frida (client, frida-server, configuration ADB) a été réalisée et documentée dans le **Lab 10 — Installation et prise en main de Frida**. Les preuves ci-dessous confirment l'état opérationnel de l'environnement pour ce lab.

### Versions Frida

```
PS C:\WINDOWS\system32> frida --version
17.10.1

PS C:\WINDOWS\system32> frida-ps --version
17.10.1
```

<!-- SCREEN : version.png — sortie de frida --version et frida-ps --version affichant 17.10.1 -->

### Import Python

```
C:\Users\mayam\AppData\Local\Programs\Python\Python311\python.exe -c "import frida; print(frida.__version__)"
17.10.1
```

<!-- SCREEN : fridapy.png — sortie Python affichant 17.10.1 -->

### ADB devices

```
C:\Users\mayam\AppData\Local\Android\Sdk\platform-tools>adb devices
List of devices attached
192.168.206.103:5555    device
```

---

## 3. Déploiement et visibilité 

### Lancement de frida-server

```bash
adb shell "/data/local/tmp/frida-server-17.10.1-android-x86 -l 0.0.0.0 &"
```

<img width="1592" height="160" alt="listen" src="https://github.com/user-attachments/assets/e3d96d54-8a93-4b53-adc4-90387ff8d021" />

### Vérification du processus frida-server

<img width="1305" height="73" alt="image" src="https://github.com/user-attachments/assets/68392f5c-8073-47cb-bec7-822176991370" />

---

## 4. Bypass Java

### 4.1 État AVANT bypass

Lancement de RootBeer Sample sans Frida — résultat du CHECK FOR ROOT :
<img width="452" height="962" alt="rooted" src="https://github.com/user-attachments/assets/a0fb1f6c-032e-4c36-8c3b-a5d26e46c29a" />

---

### 4.2 Script bypass_root.js (v2)

```javascript
// bypass_root.js — v2 — Neutralise les checks Java courants

function safeContains(str, needle) {
  try { return (str || "").toLowerCase().indexOf((needle||"").toLowerCase()) !== -1; } catch (_) { return false; }
}

const suspiciousPaths = [
  "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/su",
  "/system/app/Superuser.apk", "/system/app/SuperSU.apk",
  "/system/bin/.ext/.su", "/system/usr/we-need-root/",
  "/system/xbin/daemonsu", "/system/etc/init.d/99SuperSUDaemon",
  "/system/bin/busybox", "/system/xbin/busybox"
];

Java.perform(function () {

  // 1) Build.TAGS -> release-keys
  try {
    const Build = Java.use("android.os.Build");
    Object.defineProperty(Build, "TAGS", { get: function() { return "release-keys"; } });
    console.log("[+] Hook Build.TAGS -> release-keys");
  } catch (e) { console.log("[-] Build.TAGS:", e.message); }

  // 2) RootBeer — hooker toutes les méthodes de détection
  try {
    const RootBeer = Java.use("com.scottyab.rootbeer.RootBeer");
    const methods = [
      "isRooted", "isRootedWithBusyBoxCheck", "detectRootManagementApps",
      "detectPotentiallyDangerousApps", "detectTestKeys", "checkForBusyBoxBinary",
      "checkForSuBinary", "checkSuExists", "checkForRWPaths", "checkDangerousProps",
      "checkRootThroughNativeCode", "detectRootCloakingApps"
    ];
    methods.forEach(function(m) {
      try {
        RootBeer[m].implementation = function() {
          console.log("[+] RootBeer." + m + " -> false");
          return false;
        };
      } catch(_) {}
    });
    console.log("[+] RootBeer hooks installés");
  } catch (e) { console.log("[*] RootBeer:", e.message); }

  // 3) File.exists -> false pour chemins suspects
  try {
    const File = Java.use("java.io.File");
    File.exists.implementation = function () {
      const path = this.getAbsolutePath();
      if (suspiciousPaths.indexOf(path) !== -1) {
        console.log("[+] File.exists bypass for", path);
        return false;
      }
      return this.exists.call(this);
    };
  } catch (e) { console.log("[-] File.exists:", e); }

  // 4) Runtime.exec -> bloquer su/which/busybox
  try {
    const Runtime = Java.use("java.lang.Runtime");
    Runtime.exec.overload("java.lang.String").implementation = function (cmd) {
      if (safeContains(cmd, "su") || safeContains(cmd, "busybox") || safeContains(cmd, "which")) {
        console.log("[+] Blocked Runtime.exec:", cmd);
        return this.exec("echo");
      }
      return this.exec(cmd);
    };
    console.log("[+] Runtime.exec hook installé");
  } catch (e) { console.log("[-] Runtime.exec:", e); }

  // 5) SystemProperties -> DangerousProps
  try {
    const SystemProperties = Java.use("android.os.SystemProperties");
    SystemProperties.get.overload("java.lang.String").implementation = function (key) {
      const val = this.get(key);
      if (safeContains(key, "ro.debuggable")) { console.log("[+] SystemProperties: " + key + " -> 0"); return "0"; }
      if (safeContains(key, "ro.secure"))     { console.log("[+] SystemProperties: " + key + " -> 1"); return "1"; }
      if (safeContains(key, "service.adb.root")) { console.log("[+] SystemProperties: " + key + " -> 0"); return "0"; }
      return val;
    };
    console.log("[+] SystemProperties hook installé");
  } catch (e) { console.log("[-] SystemProperties:", e); }

  console.log("[+] Java layer bypass v2 installed");
});
```

### 4.3 Lancement et logs

```bash
frida -U -f com.scottyab.rootbeer.sample -l C:\frida-lab\bypass_root.js
```

**Logs console Frida :**

<img width="688" height="227" alt="image" src="https://github.com/user-attachments/assets/2b692844-a92f-4634-add4-7b8fcced7718" />

### 4.4 État APRÈS bypass Java

| Check | Avant | Après bypass Java |
|---|---|---|
| Root Management Apps | ❌ | ✅ |
| Potentially Dangerous Apps | ❌ | ✅ |
| Root Cloaking Apps | ❌ | ✅ |
| TestKeys | ❌ | ✅ |
| BusyBoxBinary | ❌ | ✅ |
| SU Binary | ❌ | ✅ |
| 2nd SU Binary check | ❌ | ✅ |
| For RW Paths | ❌ | ✅ |
| Dangerous Props | ❌ | ❌ (natif) |
| Root via native check | ❌ | ❌ (natif) |
| **Verdict** | 🔴 ROOTED* | 🟡 Partiellement bypassé |


<img width="457" height="931" alt="rooted2" src="https://github.com/user-attachments/assets/b27254d4-7ae3-4ff7-b9fd-abffdb1d3c89" />

---
## 5. Natif/Trace 

### 5.1 Identification des appels natifs via frida-trace

```bash
frida-trace -U -f com.scottyab.rootbeer.sample -i "open" -i "access" -i "stat" -i "openat"
```

**Résultat :**
<img width="983" height="142" alt="image" src="https://github.com/user-attachments/assets/7c48b5b2-e959-4fab-baea-f2ff7e2306d4" />

Après activation du CHECK FOR ROOT, les chemins suspects suivants ont été identifiés :

<img width="709" height="430" alt="image" src="https://github.com/user-attachments/assets/c47d3f89-6a61-43a0-8172-72dcb29089df" />

**Analyse :** RootBeer effectue des vérifications natives sur :
- Les binaires `su` dans `/odm/bin`, `/vendor/bin`, `/vendor/xbin`
- Les binaires `magisk` dans plus de 15 chemins différents
- Les montages via `/proc/mounts`

---

### 5.2 Script bypass_native.js (v2 — chemins enrichis)

```javascript
// bypass_native.js — v2 avec chemins identifiés via frida-trace

const SUS = [
  "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/su",
  "/odm/bin/su", "/vendor/bin/su", "/vendor/xbin/su",
  "/system/bin/busybox", "/system/xbin/busybox",
  "/data/local/magisk", "/data/local/bin/magisk", "/data/local/xbin/magisk",
  "/sbin/magisk", "/su/bin/magisk",
  "/system/bin/magisk", "/system/bin/.ext/magisk", "/system/bin/failsafe/magisk",
  "/system/sd/xbin/magisk", "/system/usr/we-need-root/magisk",
  "/system/xbin/magisk", "/cache/magisk", "/data/magisk",
  "/dev/magisk", "/system/sbin/magisk", "/odm/bin/magisk",
  "/vendor/bin/magisk", "/vendor/xbin/magisk",
  "/proc/mounts", "/proc/self/mounts"
];

function isSuspicious(ptrPath) {
  try {
    const p = ptrPath.readCString();
    return !!p && SUS.some(function(s) { return p.indexOf(s) !== -1; });
  } catch (_) { return false; }
}

function hookFunc(name, argIdx) {
  try {
    const addr = Module.getExportByName(null, name);
    Interceptor.attach(addr, {
      onEnter(args) {
        if (isSuspicious(args[argIdx])) {
          this.block = true;
          this.path = args[argIdx].readCString();
        }
      },
      onLeave(retval) {
        if (this.block) {
          console.log("[+] Blocked " + name + " on " + this.path);
          retval.replace(ptr(-1));
        }
      }
    });
    console.log("[+] Hooked " + name);
  } catch (e) { console.log("[-] " + name + ":", e.message); }
}

hookFunc("open", 0);
hookFunc("openat", 1);
hookFunc("access", 0);
hookFunc("stat", 0);
hookFunc("lstat", 0);

console.log("[+] Native bypass v2 installed");
```

### 5.3 Lancement combiné Java + Natif

```bash
frida -U -f com.scottyab.rootbeer.sample -l C:\frida-lab\bypass_root.js -l C:\frida-lab\bypass_native.js
```

**Logs console Frida :**

<img width="1037" height="646" alt="image" src="https://github.com/user-attachments/assets/fee4e960-4a77-411d-85b1-82067cd7ef14" />

### 5.4 État FINAL après bypass Java + Natif
<img width="453" height="927" alt="image" src="https://github.com/user-attachments/assets/e6d9f3ac-5e1f-454a-a678-dfc2dda105ef" />

| **Score** | 0/10 | 8/10 | **9/10** |

> **Note :** Le check `Dangerous Props` résiste car il s'appuie sur des propriétés système kernel-level (`ro.debuggable`, `ro.secure`) lues directement via `/proc/sys` — non interceptables sans hook plus profond sur `__system_property_get` au niveau natif. Ce comportement est attendu sur Genymotion et documenté dans le lab.

---

## 6. Conclusion

### Récapitulatif des objectifs

| Objectif | Statut |
|---|---|
| Comprendre les techniques de détection root Java | ✅ |
| Comprendre les techniques de détection root natif | ✅ |
| Bypass Java (Build.TAGS, File.exists, Runtime.exec, RootBeer) | ✅ 8/10 checks |
| Identifier les appels natifs via frida-trace | ✅ 21+ chemins identifiés |
| Bypass natif (open, access, stat, openat, lstat) | ✅ 9/10 checks — Root via native check bypassé |
| Documenter avant/après | ✅ |

### Points clés appris

**Côté Java :** RootBeer utilise `Build.TAGS`, `File.exists()`, `Runtime.exec()` et des propriétés système pour détecter le root. Ces checks sont facilement neutralisés via des hooks Java Frida.

**Côté natif :** Le code JNI de RootBeer accède directement à des chemins suspects via `open`, `access` et `stat`. `frida-trace` permet d'identifier précisément ces chemins pour construire une liste de blocage exhaustive.

**Limite observée :** Les propriétés kernel (`ro.debuggable`, `ro.secure`) ne peuvent pas être spoofées au niveau Java seul — elles nécessitent un hook plus profond au niveau natif de `__system_property_get` ou une modification du système.

### Scripts produits

| Fichier | Rôle |
|---|---|
| `bypass_root.js` | Bypass Java : Build.TAGS, RootBeer, File.exists, Runtime.exec, SystemProperties |
| `bypass_native.js` | Bypass natif : open, openat, access, stat, lstat sur 28 chemins suspects |

---

*Rapport généré le 05 juin 2026 — Lab Root Detection Bypass — Frida 17.10.1*
