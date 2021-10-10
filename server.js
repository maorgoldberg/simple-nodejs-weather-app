const express = require('express');
const tracer = require('./tracer');
const bodyParser = require('body-parser');
const sqlite = require('better-sqlite3');
const request = require('request');
const apiKey = '3cd7c2e770c989657a44b55c6bee65f2';
const { context, trace, SpanKind } = require('@opentelemetry/api');
const app = express()


app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs')
let db = new sqlite(':memory:')
db.prepare(`
  CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT UNIQUE,
  temperture FLOAT(4,2));`).run();

app.get('/', function (req, res) {	
  res.render('index',{weather: null, error: null})
})

app.post('/', async function (req, res) {
	const postSpan = tracer.startSpan("Post /");
	await context.with(trace.setSpan(context.active(), postSpan), async () => {
		let city = req.body.city;
		let sql = `SELECT * FROM cities
				WHERE city='${city}'`;
		const selectSpan = tracer.startSpan('SELECT DB.cities', {
			kind: SpanKind.CLIENT, // server
			attributes: {
				"db.system": "sqlite",
				"net.peer.ip": "127.0.0.1",
				"db.statement": "SELECT * FROM cities WHERE city='${city}'",
				"db.operation": "SELECT",
				"db.sql.table": "cities"},
		});
		const rows = db.prepare(sql).all();
		if (rows.length > 0) {
			selectSpan.setAttribute("city", city);
			selectSpan.setAttribute("temperture", rows[0].temperture);
			let weatherText = `It's ${rows[0].temperture} degrees in ${rows[0].city}!`;
			console.log(weatherText)
			res.render('index', {weather: weatherText, error: null});
			selectSpan.end();
		} else {
			selectSpan.end();
			const callback = async () => {
				try {
					await makeWeatherRequest(db, city, apiKey, res)
				} catch (error) {
					console.error(error)
					throw error;
				}
		}
    const weatherSpan = tracer.startSpan('Get weather', {
			kind: SpanKind.CLIENT, // server
			attributes: {
				"http.method": "GET",
				"http.url": "http://api.openweathermap.org",
				"http.target": "/data/2.5/weather?q=${city}&units=imperial&appid=${apiKey}",
				"http.host": "api.openweathermap.org",
				"http.scheme": "http"},
		});
      await context.with(trace.setSpan(context.active(), weatherSpan), callback)
      weatherSpan.end();
		}
	})
	postSpan.end();
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})

function downloadPage(url) {
    return new Promise((resolve, reject) => {
        request(url, (error, response, body) => {
            if (error) reject(error);
            if (response.statusCode != 200) {
                reject('Invalid status code <' + response.statusCode + '>');
			}
			console.log(trace.getSpan(context.active()), "Inside request");
			resolve(body);
        });
    });
}

async function makeWeatherRequest(db, city, apiKey, res){
	let url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&units=imperial&appid=${apiKey}`
	try {
		const html = await downloadPage(url)
		let weather = JSON.parse(html)
		const dbSpan = tracer.startSpan('INSERT DB.cities', {
			kind: SpanKind.CLIENT, // server
			attributes: {
			  "db.system": "sqlite",
			  "net.peer.ip": "127.0.0.1",
			  "db.statement": "INSERT INTO cities(city,temperture) VALUES(?,?) ON CONFLICT(city) DO UPDATE SET temperture = excluded.temperture",
			  "db.operation": "INSERT",
			  "db.sql.table": "cities"},
		  });
		db.prepare(`INSERT INTO cities(city,temperture) VALUES(?,?) ON CONFLICT(city) DO UPDATE SET temperture = excluded.temperture;`).run(city, weather.main.temp)
		let weatherText = `It's ${weather.main.temp} degrees in ${weather.name}!`;
		res.render('index', {weather: weatherText, error: null});
		dbSpan.end()
		
	} catch (error) {
		res.render('index', {weather: null, error: 'Error, please try again'});
		console.error(error);
	}
}

process.on('SIGINT', function() {
	console.log("Caught interrupt signal");
	db.close((err) => {
		if (err) {
		  return console.error(err.message);
		}
		
	  });
	  console.log('Close the database connection.');
	process.exit();
});