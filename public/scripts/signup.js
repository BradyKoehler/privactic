var gen;
function signup() {
  var data = $("form#signup-form").serializeArray();
  console.log(data);

  var my_asp = new kbpgp.ASP({
    progress_hook: function(o) {
      // console.log("Progress: ", o);
      $("#keygen-progress").text("Progress: " + JSON.stringify(o));
    }
  });

  var username = $("#username").val(),
      email    = $("#email").val(),
      password = $("#password").val(),
      keypass  = $("#key_password").val();

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
    if (err) {
      console.error(err);
    } else {
      gen = user;
      // console.log("Key created: ", user);

      dataGenerated('user', {
        username: username,
        email: email,
        password: password
      });

      // Sign the generated key
      user.sign({}, function(err) {
        console.log(err);

        // Export private key
				user.export_pgp_private ({
	        passphrase: keypass
	      }, function(err, pgp_private) {
          console.log(err);
  				// $('#pgp_private').text(pgp_private);
          // private = pgp_private;

          dataGenerated('private', pgp_private);
	      });

        // Export public key
		  	user.export_pgp_public({}, function(err, pgp_public) {
          console.log(err);
  				// $('#pgp_public').text(pgp_public);
          // public = pgp_public;

          dataGenerated('public', pgp_public);
	      });
	    });
    }
  });
}

var gendata = {};

function dataGenerated(key, data) {
  gendata[key] = data;

  if (gendata['user'] && gendata['private'] && gendata['public']) {
    // console.log(gendata);

    $("#username2").val(gendata.user.username);
    $("#email2").val(gendata.user.email);
    $("#password2").val(gendata.user.password);
    $("#private").val(gendata.private);
    $("#public").val(gendata.public);

    $("#submit-form").submit();
  }
}
