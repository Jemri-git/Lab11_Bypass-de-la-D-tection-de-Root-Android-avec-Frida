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
