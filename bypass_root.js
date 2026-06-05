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
