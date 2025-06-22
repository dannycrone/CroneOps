let inputId = 1;

Shelly.addEventHandler(function (event) {
  if (event.component === "input:" + inputId && event.event === "single_push") {
    // Turn off all Entrance Hall and Landing lighting circuits and Garden C1
    Shelly.call("http.get", { url: "http://192.168.10.11/rpc/Light.Set?id=0&on=false" });
    Shelly.call("http.get", { url: "http://192.168.10.11/rpc/Light.Set?id=1&on=false" });
    Shelly.call("http.get", { url: "http://192.168.10.12/rpc/Light.Set?id=0&on=false" });
    Shelly.call("http.get", { url: "http://192.168.10.12/rpc/Light.Set?id=1&on=false" });
    Shelly.call("http.get", { url: "http://192.168.10.13/rpc/Light.Set?id=0&on=false" });
    Shelly.call("http.get", { url: "http://192.168.10.13/rpc/Light.Set?id=1&on=false" });
    Shelly.call("http.get", { url: "http://192.168.10.51/rpc/Switch.Set?id=1&on=false" });
  }
});