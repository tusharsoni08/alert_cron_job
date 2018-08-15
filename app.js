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
	                let options = {
	                    uri: process.env['ENQUIRY_URL'] + user_data['train_number'] + '&startDate=' + formatDate(user_data['boarding_date'].toDate()) + '&journeyStn=' + user_data['station_code'] + '&journeyDate=' + formatDate(user_data['arrival_date'].toDate()) + '&boardDeboard=0&langFile=props.en-us',
	                    transform: function (body) {
	                        return cheerio.load(body);
	                    }
	                };
	                  
	                rp(options)
	                    .then(($) => {
	                        let running_status = $('td[id=qrdPosSttsMsg]').text().split('\n')[1];
	                        let remaining_dist = parseInt($('span[class=kilometers]').text().split(' ')[1]);

	                        if(running_status.toLowerCase() == "Yet to arrive".toLowerCase()){
	                            if(remaining_dist < 50){
	                                pushNotification(doc.id);
	                                db.collection("users").doc(doc.id).delete().then(function() {
	                                    console.log("User data successfully deleted.");
	                                }).catch(function(error) {
	                                    console.error("Error removing document: ", error);
	                                });
	                            } else {
	                            	if(remaining_dist != user_data['remaining_dist']){
	                            		let userRef = db.collection('users').doc(doc.id);
	                                	let updateDistance = userRef.update({ remaining_dist: remaining_dist });
	                                	console.log("Successfully Updated the remaining distance.");
	                            	}
	                            }
	                        }
	                    })
	                    .catch((err) => {
	                        console.log('Error fetching train info', err);
	                    });
	            });
	        }
	    }).then(function(){
	        res.send('Ok');
	        console.timeEnd('Process-time');
	    }).catch(err => {
	        console.log('Error getting documents', err);
	        res.send('Error')
	    });
})

function formatDate(date) {
    let d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [day, month, year].join('/');
}

function pushNotification(userId) {
	console.log('Sending push notification ...')
	let url = process.env['PUSH_URL'];
	let data = {userId: userId};

	fetch(url, {
	  method: 'POST',
	  body: JSON.stringify(data), // data can be `string` or {object}!
	  headers:{
	    'Content-Type': 'application/json'
	  }
	}).then(res => console.log(res))
	.catch(error => console.error('Error:', error))
	.then(response => console.log('Success:', response));
}