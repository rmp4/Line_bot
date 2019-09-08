'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const async = require('async');
var request = require('request');

// base URL for webhook server
let baseURL = process.env.BASE_URL;

// create LINE SDK config from env variables
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.Client(config);

// create Express app
const app = express();

app.use('/static', express.static('static'));

app.post('/callback', line.middleware(config), (req, res) => {
  if(req.body.destination) {
    console.log(`Desination User ID: ${req.body.destination}`)
  }
  // req.body.events should be an array of events
  if(!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }

  //handle evnets separetely
  Promise.all(req.body.events.map(handleEvent))
    .then(()=>res.end())
    .catch((err)=>{
      console.error(err);
      res.status(500).end();
    });
});

// event handler
function handleEvent(event) {
  switch(event.type){
    case 'message':
      const message = event.message
      switch (message.type){
        case 'text':
          return handleText(message,event.replyToken,event.source);
        default:
          throw new ErrorEvent(`Unkonw message: ${JSON.stringify(message)}`)
      }
    case 'follow':
      return replyText(event.replyToken, '你好 我目前還在測試中，目前先以台積電的股票做為參考操作');
  }
}
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map((text) => ({ type: 'text', text }))
  );
};
async function handleText(message,replyToken,source){
  console.log(`Echo messge to ${replyToken}: ${message.text}`);
  const buttonsImageURL = `${baseURL}/static/fugle.png`;
  var rc
  switch(message.text){
    case '顯示股價':
      rc = await getFCNTdata('https://www.fugle.tw/api/v1/data/new_content/FCNT000099?symbol_id=2330')
      let lastday_info= JSON.parse(rc).rawContent.day.pop();
      console.log(lastday_info)
      let info = `名稱: 台積電 \n代號: 2330 \n成交價格: ${lastday_info.close} \n漲跌: ${lastday_info.change} \n漲跌幅: ${lastday_info.change_rate}% \n成交量: ${lastday_info.volumeOrAmount} `
      return replyText(replyToken,`${info}`)
    case '顯示新聞':
        rc= await getFCNTdata('https://www.fugle.tw/api/v1/data/new_content/FCNT000050?symbol_id=2330')
        let NEWS= JSON.parse(rc).rawContent.map(info=>{
        return info.title + "\n" + info.url
      })
      return replyText(replyToken,NEWS.join('\n\n'))
    case '顯示PTT新聞':
        rc = await getFCNTdata('https://www.fugle.tw/api/v1/data/new_content/FCNT000073?symbol_id=2330')
        let PTT_NEWS= JSON.parse(rc).rawContent.map(info=>{
        return info.title + "\n" + info.url
      })
      console.log(PTT_NEWS)
      return replyText(replyToken,PTT_NEWS.join('\n\n'))
    default:
      return client.replyMessage(
        replyToken,
        {
          type: 'template',
          altText: 'Buttons alt text',
          template: {
            type: 'buttons',
            thumbnailImageUrl: buttonsImageURL,
            title: '功能',
            text: '目前先以台積電的股票做為參考操作 \n股票功能',
            actions: [
              { label: '股價', type: 'message', text: '顯示股價' },
              { label: '新聞', type: 'message', data: 'news' ,text:'顯示新聞' },
              { label: 'PTT新聞', type: 'message' ,text:'顯示PTT新聞' },
            ],
          },
        }
      );
  }
  return replyText(replyToken,message.text)
}

function getFCNTdata(url) {
  return new Promise(function (resolve, reject) {
    request(url, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}
// listen on port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});