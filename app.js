const express = require("express");
const request = require("request");
const cheerio = require("cheerio");
const {appendFileSync} = require("fs");
const fs = require("fs");
const csv = require("csv-parser");
const nodeCron = require("node-cron")

const app = express()

class Headline {
    constructor(id, title, author, date, score, comments){
        this.id = id
        this.title = title
        this.author = author
        this.date = date
        this.score = score
        this.comments = comments
    }

    saveAsCSV(path){
        const csv = `${this.id},${this.title},${this.author},${this.date},${this.score},${this.comments}\n`
        try{
            appendFileSync(path, csv)
        }
        catch(err){
            console.log("Error in writing CSV");
        }
    }
}

const getCurrentDate = () => {
    var date = new Date();
    date = `${date.getDate()}-${date.getMonth() }-${date.getFullYear()}`
    return date;
}

const readCurrentFile = () => {
    var headlines_data = {};
    return new Promise((res, rej) => {
        const path = `./${getCurrentDate()}.csv`;
        const file = fs.createReadStream(path)
        file.on('error', ()=>{
            rej({});
        })

        file.pipe(csv())
        .on('data', function(data){
            headlines_data[data.ID] = data;
        })
        .on('end',function(){
            res(headlines_data);
        });
    });
}

async function getCurrentFileData(){
    try{
        const data = await readCurrentFile();
        return data;
    }
    catch(error){
        return error;
    }
}

// getCurrentFileData();

const readWebPage = (body) => {

    const $ = cheerio.load(body);
    const ordered_keys = []
    const headlines_data = {};
    const headlines = $('tr.athing').map((i, tr) => { 
        const id = $(tr).attr().id;
        const headline = $(tr).find("span.titleline > a"); 
        headlines_data[id] = {
            id: id,
            title: headline.text()
        }
        ordered_keys.push(id);
    })
    $("span.subline").map((i, line) => {
        const score = $(line).find(".score").text().replace(/\D/g, "").trim();
        const id = $(line).find(".score").attr().id.replace("score_", "").trim()
        const author = $(line).find(".hnuser").text();
        const date = $(line).find(".age").attr().title.split("T")[0];
        var comment = "0";
        const lastChild = $(line).children("a").last().text();
        if(lastChild.indexOf("comment") !== -1){
            comment = lastChild.replace("comment", "").trim()
        }
        headlines_data[id] = {
            ...headlines_data[id],
            author: author,
            date: date,
            score: score,
            comments: comment
        }
    })
    ordered_keys.reverse();
    return [ordered_keys, headlines_data];
}

async function writeScrappedData(keys, headlines_data, write_path, callback){
    var current_data = await getCurrentFileData();
    // console.log(current_data);
    console.log(`Got ${Object.keys(current_data).length} lines in existing file`);
    if(!fs.existsSync(write_path)){
        // Write Header
        let header = new Headline("ID", "TITLE", "AUTHOR", "DATE", "SCORE", "COMMENTS")
        header.saveAsCSV(write_path)
    }
    // Append Data
    for(var i=0;i<keys.length;i++){
        let id = keys[i];
        if(!(id in current_data)){
            let val = headlines_data[id];
            let headline = new Headline(id, val.title, val.author, val.date, val.score, val.comments);
            headline.saveAsCSV(write_path);
        }
    }
    console.log("File Written Successfully");
    callback();
}

const fetchLatestNews = () => {
    var options = {
        method: 'GET',
        url: 'https://news.ycombinator.com/newest',
        headers: {
            'postman-token': '7775c581-1ed1-0da0-6571-a2fe3968e9c3',
            'cache-control': 'no-cache'
        },
    };
    request(options, function (error, response, body) {
        if (error) throw new Error(error);
        
        const [keys, new_data] = readWebPage(body);
        console.log(`Fetched ${keys.length} records from Scrapping`);
        const path = `./${getCurrentDate()}.csv`;
        writeScrappedData(keys, new_data, path, ()=>{
            console.log("Latest news added to the file");
        }); 
    });
}

const job = nodeCron.schedule("0 */2 * * * *", ()=> {
    console.log("Fetching Latest News at " + new Date().toLocaleString());
    fetchLatestNews()
})

app.get("/", async (req, res)=> {
    var current_data = await getCurrentFileData();
    var result = []
    for(var id in current_data){
        result.push(current_data[id]);
    }
    res.send(result);
})

const port = process.env.PORT || 8000;
app.listen(port, ()=> {
    console.log("Serving Running");
    console.log("Fetching Latest News at " + new Date().toLocaleString());
    fetchLatestNews();
})