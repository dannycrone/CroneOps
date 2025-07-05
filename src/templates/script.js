function clearPirTimer(state) {
  if (state.timer !== null) {
    Timer.clear(state.timer);
    state.timer = null;
  }
}

function handlePirMotion(input, urls, isOn) {
  try {
    var state = pirStates[input] || { isLightOn: false, timer: null };
    pirStates[input] = state;

    if (isOn) { // Motion
      if (!state.isLightOn) {
        for (const url of urls) {
          httpGet(url);
        }
        state.isLightOn = true;
      }
      clearPirTimer(state);
    } else { // Absence
      if (state.isLightOn) {
        clearPirTimer(state);
        state.timer = Timer.set(pirMinutes * 60000, false, function() {
          for (const url of urls) {
            httpGet(url);
          }
          state.isLightOn = false;
          state.timer = null;
        });
      }
    }
  } catch(e) {
    ErrorMsg(e, 'handlePirMotion()');
  }
}

function isNightTime() {
  let hour = (new Date()).getHours();
  return (hour < morning || hour >= evening);
}

function dynamicUrl(url) {
  // Replace placeholder with actual function call
  return url.replace("%adaptive%", isNightTime() ? midLight : highLight)
  .replace("%nightOnly%", isNightTime())
  .replace("%lowLight%", lowLight)
  .replace("%midLight%", midLight)
  .replace("%highLight%", highLight)  
  .replace("%maxLight%", maxLight);
}

function httpGet(url) {
  // Replace placeholder with actual function call
  Call('HTTP.get', {
    url: dynamicUrl(url),
    timeout: 10
  });
}

function Event_Trigger(event) {
  try {
// EVENT_HANDLERS
  } catch(e) {
    ErrorMsg(e, 'Event_Trigger()');
  }
}

function Main() {
  Shelly.addEventHandler(Event_Trigger);
}

//=========== Dekats Toolbox ===========//
// A universal Toolbox for Shelly scripts

function Blink(bc, dl, c, st) {
  // Call Blink function
  // bc=blinkCount, dl=blinkDelay, c=call->as_arry->[methode,parameter], st=startCount
  try {
    if (tH8) Timer.clear(tH8);
    tH8 = 0;
    if (!Str(st)) st = 0;
    if (st < bc * 2) {
      st++;
    } else {
      st = 0;
      return;
    }
    if (!tH8) {
      tH8 = Timer.set(1000 * dl, 0, function() {
        Call(c[0], c[1], function() {
          tH8 = 0;
          Blink(bc, dl, c, st);
        }, c[3], c[4]);
      });
    }
  } catch(e) {
    ErrorMsg(e, 'Blink()');
  }
}

function SwitchM(cID, rM, iT, deBug) {
  // Change rM=RelayMode, iT=InputMode, cID=Relay_ID and/or Input_ID
  // More Info, rM='detached'->detached/flip/momentary/follow,iT='switch'->button/switch
  try {
    let r = 0;
    if (Config('switch', cID).initial_state === 'match_input') {
      Call('Switch.SetConfig', {id: cID, config: {initial_state: 'restore_last'}});
    }
    if (rM && Config('switch', cID).in_mode !== rM) {
      Call('Switch.SetConfig', {id: cID, config: {in_mode: rM}});
      if (!r) r = '';
      r += 'rM, ';
    }
    if (iT && Config('input', cID).type !== iT) {
      Call('Input.SetConfig', {id: cID, config: {type: iT}});
      if (!r) r = '';
      r += 'iT, ';
    }
    if (deBug) {
      r = 'Debug: tried to change-> ' + (r || 'nothing,') + ' Oldconfig: rM-> ' + Config('switch', cID).in_mode + ', iT-> ' + Config('input', cID).type;
      print(r);
    }
    return r;
  } catch(e) {
    ErrorMsg(e, 'SwitchM()');
  }
}

function Str(d) {
  // Upgrade JSON.stringify
  try {
    if (d === null || d === undefined) return null;
    if (typeof d === 'string') return d;
    return JSON.stringify(d);
  } catch(e) {
    ErrorMsg(e, 'Str()');
  }
}

function Cut(f, k, o, i) {
  // Upgrade slice f=fullData, k=key-> where to cut, o=offset->offset behind key, i=invertCut
  try {
    let s = f.indexOf(k);
    if (s === -1) return;
    if (o) s = s + o.length || s + o;
    if (i) return f.slice(0, s);
    return f.slice(s);
  } catch(e) {
    ErrorMsg(e, 'Cut()');
  }
}

function Efilter(d, p, deBug) {
  // Event Filter
  // d=eventdata, p={device:[], filterKey:[], filterValue:[], noInfo:true, inData:true}->optional_parameter
  try {
    let fR = {};
    if (p.noInfo) {
      fR = d;
      d = {};
      d.info = fR;
      fR = {};
    }
    if (p.inData && d.info.data) {
      d.info = d.info.data;
      delete d.info.data;
    }
    if (!d.info) fR.useless = true;
    if (p.device.length > 0 && p.device.indexOf(d.info.component) === -1) fR.useless = true;
    if (p.filterKey && !fR.useless) {
      for (f of p.filterKey) {
        for (k in d.info) {
          if (f === k) fR[k] = d.info[k];
        }
      }
    }
    if (p.filterValue && !fR.useless) {
      for (f of p.filterValue) {
        for (v of d.info) {
          if (Str(v) && f === v) fR[Str(v)] = v;
        }
      }
    }
    if (deBug) {
      print('\nDebug: EventData-> ', d, '\n\nDebug: Result-> ', fR, '\n');
    }
    if (Str(fR) === '{}' || fR.useless) return;
    return fR;
  } catch(e) {
    ErrorMsg(e, 'Efilter()');
  }
}

function ErrorChk(r, e, m, d) {
  // Shelly.call error check
  try {
    aC--;
    if (aC < 0) aC = 0;
    if (d.CB && d.uD) d.CB(r, d.uD);
    if (d.CB && !d.uD) d.CB(r);
    if (!d.CB && d.uD) print('Debug: ', d.uD);
    if (e) throw new Error(Str(m));
    if (Str(r) && Str(r.code) && r.code !== 200) throw new Error(Str(r));
  } catch(e) {
    ErrorMsg(e, 'ErrorChk(), call Answer');
  }
}

function Cqueue() {
  // Shelly.call queue
  try {
    if (!cCache[0] && !nCall[0]) return;
    if (!nCall[0]) {
      nCall = cCache[0];
      cCache.splice(0, 1);
    }
    if (nCall[0] && aC < callLimit) {
      Call(nCall[0], nCall[1], nCall[2], nCall[3], nCall[4]);
      nCall = [];
    }
    if ((nCall[0] || cCache[0]) && !tH7) {
      tH7 = Timer.set(1000 * cSp, 0, function() {
        tH7 = 0;
        Cqueue();
      });
    }
  } catch(e) {
    ErrorMsg(e, 'Cqueue()');
  }
}

function Call(m, p, CB, uD, deBug) {
  // Upgrade Shelly.call
  try {
    let d = {};
    if (deBug) print('Debug: calling:', m, p);
    if (CB) d.CB = CB;
    if (Str(uD)) d.uD = uD;
    if (!m && CB) {
      CB(uD);
      return;
    }
    if (aC < callLimit) {
      aC++;
      Shelly.call(m, p, ErrorChk, d);
    } else if (cCache.length < cacheLimit) {
      cCache.push([m, p, CB, uD, deBug]);
      if (deBug) print('Debug: save call:', m, p, ', call queue now:', cCache.length);
      Cqueue();
    } else {
      throw new Error('too many Calls in use, dropping call: ' + Str(m) + ', ' + Str(p));
    }
  } catch(e) {
    ErrorMsg(e, 'Call()');
  }
}

function Setup(l) {
  // Waiting 2sec, to avoid a Shelly FW Bug
  try {
    if (Main && !tH9) {
      tH9 = Timer.set(2000, l, function() {
        print('Status: started Script _[', scriptN, ']_');
        if (callLimit > 5) callLimit = 5;
        try {
          Main();
        } catch(e) {
          ErrorMsg(e, 'Main()');
          Setup();
        }
      });
    }
  } catch(e) {
    ErrorMsg(e, 'Setup()');
  }
}

function ErrorMsg(e, s) {
  // Toolbox formatted Error Msg
  try {
    let i = 0;
    if (Cut(e.message, '-104: Timed out')) i = 'wrong URL or device may be offline';
    if (s === 'Main()') i = e.stack;
    if (Cut(e.message, '"Main" is not')) i = 'define a Main() function before using Setup()';
    print('Error:', s || "", '---> ', e.type, e.message);
    if (i) print('Info: maybe -->', i);
  } catch(e) {
    print('Error: ErrorMsg() --->', e);
  }
}

//=========== Global Variables ===========//
var tH7 = 0, tH8 = 0, tH9 = 0, aC = 0;
var cCache = [], nCall = [], callLimit = 5, cacheLimit = 40, cSp = 0.2;
var pirStates = {}, pirMinutes = 5;
var morning = 6, evening = 20;
var lowLight = 20, midLight = 50, highLight = 80, maxLight = 100;
//=========== Renamed Native Functions ===========//
var Status = Shelly.getComponentStatus;
var Config = Shelly.getComponentConfig;

//=========== Pseudo Constants ===========//
var info = Shelly.getDeviceInfo();
var scriptID = Shelly.getCurrentScriptId();
var scriptN = Config('script', scriptID).name;
var nightTime = isNightTime(); // Initial check for night time

//=========== Initialize ===========//
// Toolbox v2.0-Alpha(full), Shelly FW >1.0.2
Setup();