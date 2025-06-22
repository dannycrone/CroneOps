let inputId = 0;

function isDarkOutside(callback) {
  Shelly.call("Sys.GetStatus", {}, function (res) {
    let now = new Date(res.time * 1000);
    let hour = now.getHours();
    callback(hour >= 18 || hour < 6);
  });
}

Shelly.addEventHandler(function (event) {
  if (event.component === "input:" + inputId && event.event === "single_push") {
    isDarkOutside(function (dark) {
      if (dark) {
                Shelly.call("http.get", { url: "http://192.168.10.11/rpc/Light.Set?id=0&brightness=80&on=true" });
        Shelly.call("http.get", { url: "http://192.168.10.11/rpc/Light.Set?id=1&brightness=80&on=true" });
        Shelly.call("http.get", { url: "http://192.168.10.12/rpc/Light.Set?id=0&brightness=80&on=true" });
        Shelly.call("http.get", { url: "http://192.168.10.12/rpc/Light.Set?id=1&brightness=80&on=true" });
        Shelly.call("http.get", { url: "http://192.168.10.13/rpc/Light.Set?id=0&brightness=80&on=true" });
        Shelly.call("http.get", { url: "http://192.168.10.13/rpc/Light.Set?id=1&brightness=80&on=true" });
        Shelly.call("http.get", { url: "http://192.168.10.51/rpc/Switch.Set?id=1&on=true" });
        return;
      }

            Shelly.call("http.get", { url: "http://192.168.10.11/rpc/Light.Set?id=0&brightness=50&on=true" });
      Shelly.call("http.get", { url: "http://192.168.10.11/rpc/Light.Set?id=1&brightness=50&on=true" });
      Shelly.call("http.get", { url: "http://192.168.10.12/rpc/Light.Set?id=0&brightness=50&on=true" });
      Shelly.call("http.get", { url: "http://192.168.10.12/rpc/Light.Set?id=1&brightness=50&on=true" });
      Shelly.call("http.get", { url: "http://192.168.10.13/rpc/Light.Set?id=0&brightness=50&on=true" });
      Shelly.call("http.get", { url: "http://192.168.10.13/rpc/Light.Set?id=1&brightness=50&on=true" });
      Shelly.call("http.get", { url: "http://192.168.10.51/rpc/Switch.Set?id=1&on=false" });
    });
  }
});