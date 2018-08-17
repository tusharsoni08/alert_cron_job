const admin = require('firebase-admin');
const rp = require('request-promise');
const cheerio = require('cheerio');
const express = require('express');
require('es6-promise').polyfill();
require('isomorphic-fetch');

const app = express();
app.listen(process.env.PORT, ()=>{console.log('Server Started ...')});

//Initialize firestore on server
admin.initializeApp({
  credential: admin.credential.cert({
			  "type": "service_account",
			  "project_id": process.env['PROJECT_ID'],
			  "private_key_id": process.env['PRIVATE_KEY_ID'],
			  "private_key": JSON.parse(process.env['PRIVATE_KEY']),
			  "client_email": process.env['CLIENT_EMAIL'],
			  "client_id": process.env['CLIENT_ID'],
			  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
			  "token_uri": "https://accounts.google.com/o/oauth2/token",
			  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
			  "client_x509_cert_url": process.env['CLIENT_CERT_URL']
			})
});

const db = admin.firestore();
const settings = { timestampsInSnapshots: true};
admin.firestore().settings(settings);

app.get('/', function (req, res) {
	console.log("\n");
	console.time('Process-time');
	let collectionReference = db.collection('users');
	let allUsers = collectionReference.get()
	    .then(snapshot => {
	        if(!snapshot.empty){
	            snapshot.forEach(doc => {
	                let user_data = doc.data();
	                console.log('Fetching train info...');
	                let url_test = process.env['ENQUIRY_URL'] + user_data['train_number'] + '&startDate=' + user_data['boarding_date'] + '&journeyStn=' + user_data['station_code'] + '&journeyDate=' + user_data['arrival_date'] + '&boardDeboard=0&langFile=props.en-us'
	                console.log(url_test)
	                let options = {
	                    uri: url_test,
	                    transform: function (body) {
	                        return cheerio.load(body);
	                    }
	                };
	                  
	                rp(options)
	                    .then(($) => {
	                        let running_status = $('td[id=qrdPosSttsMsg]').text().split('\n')[1];
	                        let remaining_dist = parseInt($('span[class=kilometers]').text().split(' ')[1]);
	                        console.log(running_status + ' - ' + remaining_dist);
	                        if(running_status != undefined && running_status.toLowerCase() == "Yet to arrive".toLowerCase()){
	                            if(remaining_dist < 50 && remaining_dist > 0){
	                            	console.log(user_data['station_name'].trunc(19));
	                                pushNotification(doc.id, remaining_dist.toString(), user_data['station_name'].trunc(19));
	                                db.collection("users").doc(doc.id).delete().then(function() {
	                                    console.log("User data successfully deleted.");
	                                }).catch(function(error) {
	                                    console.error("Error removing document: ", error);
	                                });
	                            } else {
	                            	if(remaining_dist != user_data['remaining_dist']){
	                            		let userRef = db.collection('users').doc(doc.id);
	                                	let updateDistance = userRef.update({ remaining_dist: remaining_dist });
	                                	console.log("Successfully updated the remaining distance.");
	                            	}
	                            }
	                        }
	                    })
	                    .then(function(){
	                    	res.send('Ok');
	                    })
	                    .catch((err) => {
	                    	res.send('Error');
	                    	console.log('Error in fetching or processing of train info', err);
	                    });
	            });
	        } else {
	        	console.log('No documents found');
	        }
	    })
	    .then(function(){
	    	console.timeEnd('Process-time');
	    })
	    .catch(err => {
	        console.log('Error getting documents', err);
	        res.send('Error')
	    });
})

function pushNotification(user_id, remaining_dist, station_name) {
	console.log('Sending push notification ...')
	let url = process.env['PUSH_URL'];
	let data = {
		userId: user_id,
		remainingDist : remaining_dist,
		stationName : station_name
	};

	fetch(url, {
	  method: 'POST',
	  body: JSON.stringify(data), // data can be `string` or {object}!
	  headers:{
	    'Content-Type': 'application/json'
	  }
	})
	.then(function(response) {
		console.log(response.status + ' : '+response.statusText);
	})
	.catch(error => console.error('Error:', error));
}

String.prototype.trunc = String.prototype.trunc ||
      function(n){
          return (this.length > n) ? this.substr(0, n-1) + '&hellip;' : this;
      };