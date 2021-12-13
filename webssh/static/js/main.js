/*jslint browser:true */

var jQuery;
var wssh = {};
var msg={
  id: window.location.href.split('id=')[1].split('&')[0],
  encoding: window.location.href.split('encoding=')[1]
}

jQuery(function($){
  var status = $('#status'),
      form_container = $('.form-container'),
      waiter = $('#waiter'),
      style = {},
      default_title = 'WebSSH',
      title_element = document.querySelector('title'),
      custom_font = document.fonts ? document.fonts.values().next().value : undefined,
      default_fonts,
      DISCONNECTED = 0,
      CONNECTED = 2,
      fields = ['hostname', 'port', 'username'],
      form_keys = fields.concat(['password', 'totp']),
      url_opts_data = {}

      
  startToConnect()
  function populate_form(data) {
    var names = form_keys.concat(['passphrase']),
        i, name;

    for (i=0; i < names.length; i++) {
      name = names[i];
      $('#'+name).val(data.get(name));
    }
  }

  function parse_xterm_style() {
    var text = $('.xterm-helpers style').text();
    var arr = text.split('xterm-normal-char{width:');
    style.width = parseFloat(arr[1]);
    arr = text.split('div{height:');
    style.height = parseFloat(arr[1]);
  }

  function get_cell_size(term) {
    style.width = term._core._renderService._renderer.dimensions.actualCellWidth;
    style.height = term._core._renderService._renderer.dimensions.actualCellHeight;
  }

  function toggle_fullscreen(term) {
    $('#terminal .terminal').toggleClass('fullscreen');
    term.fitAddon.fit();
  }


  function current_geometry(term) {
    if (!style.width || !style.height) {
      try {
        get_cell_size(term);
      } catch (TypeError) {
        parse_xterm_style();
      }
    }

    var cols = parseInt(window.innerWidth / style.width, 10) - 1;
    var rows = parseInt(window.innerHeight / style.height, 10);
    return {'cols': cols, 'rows': rows};
  }


  function resize_terminal(term) {
    var geometry = current_geometry(term);
    term.on_resize(geometry.cols, geometry.rows);
  }

  function set_backgound_color(term, color) {
    term.setOption('theme', {
      background: color
    });
  }

  function set_font_color(term, color) {
    term.setOption('theme', {
      foreground: color
    });
  }

  function custom_font_is_loaded() {
    if (!custom_font) {
      console.log('No custom font specified.');
    } else {
      console.log('Status of custom font ' + custom_font.family + ': ' + custom_font.status);
      if (custom_font.status === 'loaded') {
        return true;
      }
      if (custom_font.status === 'unloaded') {
        return false;
      }
    }
  }

  function update_font_family(term) {
    if (term.font_family_updated) {
      console.log('Already using custom font family');
      return;
    }

    if (!default_fonts) {
      default_fonts = term.getOption('fontFamily');
    }

    if (custom_font_is_loaded()) {
      var new_fonts =  custom_font.family + ', ' + default_fonts;
      term.setOption('fontFamily', new_fonts);
      term.font_family_updated = true;
      console.log('Using custom font family ' + new_fonts);
    }
  }

  function reset_font_family(term) {
    if (!term.font_family_updated) {
      console.log('Already using default font family');
      return;
    }

    if (default_fonts) {
      term.setOption('fontFamily',  default_fonts);
      term.font_family_updated = false;
      console.log('Using default font family ' + default_fonts);
    }
  }

  function format_geometry(cols, rows) {
    return JSON.stringify({'cols': cols, 'rows': rows});
  }

  function read_as_text_with_decoder(file, callback, decoder) {
    var reader = new window.FileReader();

    if (decoder === undefined) {
      decoder = new window.TextDecoder('utf-8', {'fatal': true});
    }

    reader.onload = function() {
      var text;
      try {
        text = decoder.decode(reader.result);
      } catch (TypeError) {
        console.log('Decoding error happened.');
      } finally {
        if (callback) {
          callback(text);
        }
      }
    };

    reader.onerror = function (e) {
      console.error(e);
    };

    reader.readAsArrayBuffer(file);
  }

  function read_as_text_with_encoding(file, callback, encoding) {
    var reader = new window.FileReader();

    if (encoding === undefined) {
      encoding = 'utf-8';
    }

    reader.onload = function() {
      if (callback) {
        callback(reader.result);
      }
    };

    reader.onerror = function (e) {
      console.error(e);
    };

    reader.readAsText(file, encoding);
  }

  function read_file_as_text(file, callback, decoder) {
    if (!window.TextDecoder) {
      read_as_text_with_encoding(file, callback, decoder);
    } else {
      read_as_text_with_decoder(file, callback, decoder);
    }
  }

  function reset_wssh() {
    var name;

    for (name in wssh) {
      if (wssh.hasOwnProperty(name) && name !== 'connect') {
        delete wssh[name];
      }
    }
  }

  function log_status(text, to_populate) {
    status.html(text.split('\n').join('<br/>'));

    if (waiter.css('display') !== 'none') {
      waiter.hide();
    }

    if (form_container.css('display') === 'none') {
      form_container.show();
    }
  }

  function startToConnect() {
    var ws_url = window.location.href.split(/\?|#/, 1)[0].replace('http', 'ws'),
        join = (ws_url[ws_url.length-1] === '/' ? '' : '/'),
        url = ws_url + join + 'ws?id=' + msg.id,
        sock = new window.WebSocket(url),
        encoding = 'utf-8',
        decoder = window.TextDecoder ? new window.TextDecoder(encoding) : encoding,
        terminal = document.getElementById('terminal'),
        termOptions = {
          cursorBlink: true,
          theme: {
            background: url_opts_data.bgcolor || 'black',
            foreground: url_opts_data.fontcolor || 'white'
          }
        };

    if (url_opts_data.fontsize) {
      var fontsize = window.parseInt(url_opts_data.fontsize);
      if (fontsize && fontsize > 0) {
        termOptions.fontSize = fontsize;
      }
    }

    var term = new window.Terminal(termOptions);

    term.fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(term.fitAddon);

    if (!msg.encoding) {
      console.log('Unable to detect the default encoding of your server');
      msg.encoding = encoding;
    } else {
      console.log('The deault encoding of your server is ' + msg.encoding);
    }

    function term_write(text) {
      if (term) {
        term.write(text);
        if (!term.resized) {
          resize_terminal(term);
          term.resized = true;
        }
      }
    }

    function set_encoding(new_encoding) {
      // for console use
      if (!new_encoding) {
        console.log('An encoding is required');
        return;
      }

      if (!window.TextDecoder) {
        decoder = new_encoding;
        encoding = decoder;
        console.log('Set encoding to ' + encoding);
      } else {
        try {
          decoder = new window.TextDecoder(new_encoding);
          encoding = decoder.encoding;
          console.log('Set encoding to ' + encoding);
        } catch (RangeError) {
          console.log('Unknown encoding ' + new_encoding);
          return false;
        }
      }
    }

    wssh.set_encoding = set_encoding;

    if (url_opts_data.encoding) {
      if (set_encoding(url_opts_data.encoding) === false) {
        set_encoding(msg.encoding);
      }
    } else {
      set_encoding(msg.encoding);
    }


    wssh.geometry = function() {
      // for console use
      var geometry = current_geometry(term);
      console.log('Current window geometry: ' + JSON.stringify(geometry));
    };

    wssh.send = function(data) {
      // for console use
      if (!sock) {
        console.log('Websocket was already closed');
        return;
      }

      if (typeof data !== 'string') {
        console.log('Only string is allowed');
        return;
      }

      try {
        JSON.parse(data);
        sock.send(data);
      } catch (SyntaxError) {
        data = data.trim() + '\r';
        sock.send(JSON.stringify({'data': data}));
      }
    };

    wssh.reset_encoding = function() {
      // for console use
      if (encoding === msg.encoding) {
        console.log('Already reset to ' + msg.encoding);
      } else {
        set_encoding(msg.encoding);
      }
    };

    wssh.resize = function(cols, rows) {
      // for console use
      if (term === undefined) {
        console.log('Terminal was already destroryed');
        return;
      }

      var valid_args = false;

      if (cols > 0 && rows > 0)  {
        var geometry = current_geometry(term);
        if (cols <= geometry.cols && rows <= geometry.rows) {
          valid_args = true;
        }
      }

      if (!valid_args) {
        console.log('Unable to resize terminal to geometry: ' + format_geometry(cols, rows));
      } else {
        term.on_resize(cols, rows);
      }
    };

    wssh.set_bgcolor = function(color) {
      set_backgound_color(term, color);
    };

    wssh.set_fontcolor = function(color) {
      set_font_color(term, color);
    };

    wssh.custom_font = function() {
      update_font_family(term);
    };

    wssh.default_font = function() {
      reset_font_family(term);
    };

    term.on_resize = function(cols, rows) {
      if (cols !== this.cols || rows !== this.rows) {
        console.log('Resizing terminal to geometry: ' + format_geometry(cols, rows));
        this.resize(cols, rows);
        sock.send(JSON.stringify({'resize': [cols, rows]}));
      }
    };

    term.onData(function(data) {
      // console.log(data);
      sock.send(JSON.stringify({'data': data}));
    });

    sock.onopen = function() {
      term.open(terminal);
      toggle_fullscreen(term);
      update_font_family(term);
      term.focus();
      state = CONNECTED;
      title_element.text = url_opts_data.title || default_title;
      if (url_opts_data.command) {
        setTimeout(function () {
          sock.send(JSON.stringify({'data': url_opts_data.command+'\r'}));
        }, 500);
      }
    };

    sock.onmessage = function(msg) {
      read_file_as_text(msg.data, term_write, decoder);
    };

    sock.onerror = function(e) {
      console.error(e);
    };

    sock.onclose = function(e) {
      term.dispose();
      term = undefined;
      sock = undefined;
      reset_wssh();
      log_status(e.reason, true);
      state = DISCONNECTED;
      default_title = 'WebSSH';
      title_element.text = default_title;
    };

    $(window).resize(function(){
      if (term) {
        resize_terminal(term);
      }
    });
  }

  function cross_origin_connect(event)
  {
    var prop = 'connect',
        args;

    try {
      args = JSON.parse(event.data);
    } catch (SyntaxError) {
      args = event.data.split('|');
    }

    if (!Array.isArray(args)) {
      args = [args];
    }

    try {
      event_origin = event.origin;
      wssh[prop].apply(wssh, args);
    } finally {
      event_origin = undefined;
    }
  }

  wssh.connect = connect;
  window.addEventListener('message', cross_origin_connect, false);

  if (document.fonts) {
    document.fonts.ready.then(
      function () {
        if (custom_font_is_loaded() === false) {
          document.body.style.fontFamily = custom_font.family;
        }
      }
    );
  }

});
