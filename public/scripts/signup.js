function exists(data) {
  return data && data != '';
}

function validEmail(email) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

var usernameIsTaken = false,
    emailIsTaken = false;

function updateUsernameValidity() {
  var elem = $("#username"),
      hasClass = elem.hasClass("is-invalid");

  if (usernameIsTaken && !hasClass) {
    elem.addClass("is-invalid");
  } else if (hasClass) {
    elem.removeClass("is-invalid");
  }
}

function usernameTaken(username) {
  $.ajax({
      url: '/check/username?username=' + encodeURI(username),
      success: function (res) {
        usernameIsTaken = res.taken;
        updateUsernameValidity();
      }
  });
}

$("#username").change(function() {
  usernameTaken($(this).val());
});

function updateEmailValidity() {
  var elem = $("#email"),
    hasClass = elem.hasClass("is-invalid");

  if (emailIsTaken && !hasClass) {
    elem.addClass("is-invalid");
  } else if (hasClass) {
    elem.removeClass("is-invalid");
  }
}

function emailTaken(email) {
  $.ajax({
    url: '/check/email?email=' + encodeURI(email),
    success: function (res) {
      emailIsTaken = res.taken;
      updateEmailValidity();
    }
  });
}

$("#email").change(function() {
  emailTaken($(this).val());
});

function validate(user) {

  // Ensure username is not taken
  if (usernameIsTaken) {
    updateUsernameValidity();
    return false;
  }

  // Ensure email is not taken
  if (emailIsTaken) {
    updateEmailValidity();
    return false;
  }

  return true;
}

$(document).ready(function() {
  usernameTaken($("#username").val());
  emailTaken($("#email").val());
});

function formatProgressData(data) {
  var keys = Object.keys(data);
  var out = "<table class='keygen-progress'><tr><td colspan='4'>";
  out += "Generating keys" + ".".repeat(1 + new Date().getSeconds() % 3);
  out +="</td><tr><td>&nbsp;</td>";
  for (var i = 0; i < keys.length; i++) {
    if (i % 3 == 0) { out += "</tr><tr>"; }
    out += "<td>" + keys[i] + "&nbsp;</td><td>" + data[keys[i]] + "&nbsp;&nbsp;&nbsp;</td>";
  }
  out += "</table>";
  return out;
}

function signup() {
  var data = $("form#signup-form").serializeArray();

  var my_asp = new kbpgp.ASP({
    progress_hook: function(o) {
      if (o.p) { $("#keygen-progress").html(formatProgressData(o.p)); }
    }
  });

  var username = $("#username").val(),
      email    = $("#email").val(),
      password = $("#password").val(),
      keypass  = $("#key_password").val();

  var user = {
    username: username,
    email: email,
    password: password,
    keypass: keypass
  };

  if (validate(user)) {

    $("#signup-form-submit").attr("disabled", "disabled");

    var F = kbpgp["const"].openpgp;

    var opts = {
      asp: my_asp,
      userid: `${username} <${email}>`,
      primary: {
        nbits: 1028,
        expire_in: 0
      },
      subkeys: [
    		{
    			nbits: 1028,
    			flags: F.sign_data,
    			expire_in: 86400 * 365 * 8
    		}, {
    			nbits: 1028,
    			flags: F.encrypt_comm | F.encrypt_storage,
    			expire_in: 86400 * 365 * 8
    		}
  		]
    };

    kbpgp.KeyManager.generate(opts, function(err, user) {
      if (err) { console.error(err); }
      else {
        dataGenerated('user', {
          username: username,
          email: email,
          password: password
        });

        // Sign the generated key
        user.sign({}, function(err) {
          if (err) { console.log(err); }

          // Export private key
  				user.export_pgp_private ({
  	        passphrase: keypass
  	      }, function(err, pgp_private) {
            if (err) { console.log(err); }

            dataGenerated('private', pgp_private);
  	      });

          // Export public key
  		  	user.export_pgp_public({}, function(err, pgp_public) {
            if (err) { console.log(err); }

            dataGenerated('public', pgp_public);
  	      });
  	    });
      }
    });
  }
}

var gendata = {};

function dataGenerated(key, data) {
  gendata[key] = data;

  if (gendata['user'] && gendata['private'] && gendata['public']) {
    $("table.keygen-progress").append("<tr><td>&nbsp;</td></tr><tr><td colspan='4'>Keys generated successfully.</td></tr>");

    $("#username2").val(gendata.user.username);
    $("#email2").val(gendata.user.email);
    $("#password2").val(gendata.user.password);
    $("#private").val(gendata.private);
    $("#public").val(gendata.public);

    $("#submit-form").submit();
  }
}
