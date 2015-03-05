var fs = require('fs');
var cheerio = require('cheerio');
var async = require('async');
var superagent = require('superagent');
var mongodb = require('./db');
var path = require('path');
var http = require('http');

var nhentaiLink = "http://nhentai.net/g/";
var imageLink = "http://i.nhentai.net/galleries/";

var startNum = 1;
var endNum = 10;

var num = endNum - startNum + 1;
var err404Counter = 0;
var err0Counter = 0;
var upCounter = 0;

var urls = [];
var galleryUrls = [];

//fetchInfoDB();
startFetchData();

function fetchInfoDB(){
	makeUrls(startNum,endNum);
	mongodb.open(function(err,db){
		if(err){console.error(err);}
		console.info('mongodb connected');

		async.mapLimit(urls,10,function(url,callback){
			ClawInfo(url,db,callback);
		},function(err,result){
			if(err){console.error(err);}
		});

	});
}

function startFetchData(){
	makeGalleryUrls(startNum,endNum);
	setTimeout(function(){
		fetchData(1,galleryUrls.length);
		//console.log(galleryUrls);
	},2000);
}

function fetchData(i,max){
	if(i > max){mongodb.close(); return null;}
	var imageUrls = [];
	//console.log(codea);
	//console.log(galleryUrls);
	//console.log(i);
	imageUrls.push(galleryUrls[i-1].GallleryUrl+'cover.'+galleryUrls[i-1].Format);
	for(var j=1;j<=galleryUrls[i-1].Page;j++){
		imageUrls.push(galleryUrls[i-1].GallleryUrl+j+'.'+galleryUrls[i-1].Format);
	}
	//console.log(imageUrls);
	console.log('开始抓取第'+galleryUrls[i-1].Code+'项：'+galleryUrls[i-1].GallleryUrl+',共'+galleryUrls[i-1].Page+'页。');
	var dir = galleryUrls[i-1].Title?'data/'+galleryUrls[i-1].Code+'. '+galleryUrls[i-1].Title:'data/'+galleryUrls[i-1].Code+'. '+galleryUrls[i-1].EngTitle;
	fs.mkdir(dir,function(err){
		if(err){
			//console.log('error occured.');
			dir = 'data/'+galleryUrls[i-1].Code;
			fs.mkdirSync(dir);
		}
		async.mapLimit(imageUrls,4,function(imageUrl,callback){
			ClawImage(imageUrl,dir,callback);
		},function(err,result){
			if(err){console.error(err);}
			console.log('抓取第'+galleryUrls[i-1].Code+'项完成。');
			i = i+1;
			fetchData(i,max);
		});
	});
}

function ClawImage(url,dir,callback){
	http.get(url,function(res){
		res.setEncoding('binary');
		var imagedata = '';
		res.on('data',function(data){imagedata+=data}).on('end',function(){
			var imageName = dir+'/'+url.match(/[\w]+.jpg|[\w]+.png|[\w]+.gif/)[0];
			fs.writeFileSync(path.join(__dirname,imageName),imagedata,'binary');
			console.log('下载'+url+'完成。');
			callback(null);
		});
	});
}

function makeUrls(startNum,endNum){
	for(var i=startNum;i<=endNum;i++){
		urls.push(nhentaiLink + i +'/');
	}
}

function makeGalleryUrls(startNum,endNum){
	mongodb.open(function(err,db){
		if(err){console.error(err);}
		db.collection('items',function(err,collection){
			if(err){console.error(err);}
			pushGallery(startNum,endNum,collection);
		});
	});
}

function pushGallery(i,end,collection){
	//console.log(i);
	if(i>end){return;}
	collection.findOne({Code:i},function(err,item){
		if(err){console.error(err);}
		//console.log(item);
		if(!item){pushGallery(++i,end,collection);}
		else{
			galleryUrls.push({
				Code:item.Code,
				Title:item.Title,
				EngTitle:item.EngTitle,
				GallleryCode:item.GallleryCode,
				GallleryUrl:imageLink+item.GallleryCode+'/',
				Page:item.Page,
				Format:item.Format
			});
			pushGallery(++i,end,collection);
		}
	})
}

function ClawInfo(url,db,callback){
	var clawer = {};
	GetInfo(url,clawer,function(clawer){
		db.collection('items',function(err,collection){
			if(err){console.error(err);}
			var infoCode = Number(url.match(/\d+/)[0]);
			collection.findOne({Code:infoCode},function(err,item){
				if(err){console.error(err);}
				if(item){console.log(url+'项信息已经存在。剩余'+ --num +'项。新增了'+ upCounter +'项。');}
				else{
					if(clawer.Flag === 404){err404Counter++;console.log(url+'发生404错误，剩余'+ --num +'项。'+err404Counter+'项发生404错误，'+err0Counter+'项未能获取信息。');}
					else if(clawer.Flag === 0){err0Counter++;console.log(url+'未能成功获取信息。'+err404Counter+'项发生404错误，'+err0Counter+'项未能获取信息。');}
					else if(!clawer.Title&&!clawer.EngTitle){err0Counter++;console.log(url+'未能成功获取信息。'+err404Counter+'项发生404错误，'+err0Counter+'项未能获取信息。');}
					else{
						db.collection('items',function(err,collection){
							if(err){mongodb.close();console.error(err);}
							collection.insert(clawer,{safe:true},function(err,item){			
								if(err){return console.error(err);}
								console.log('抓取'+url+'完成，剩余'+ --num +'项。'+err404Counter+'项发生404错误，'+err0Counter+'项未能获取信息，新增了'+ ++upCounter +'项。');
								if(num===0){console.log('抓取完成，共'+(endNum - startNum + 1)+'项，成功抓取'+(endNum - startNum + 1 - err404Counter-err0Counter)+'项，'+err404Counter+'项发生404错误，'+err0Counter+'项未能获取信息。');}
							});
						});
					}
				}
			});
		});
	});
	setTimeout(function(){callback(null)},200);
}

function GetInfo(url,clawer,callback){

	superagent.get(url)
	.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.94 Safari/537.36')
	.end(function(err,sres){
		if(sres){
			var $ = cheerio.load(sres.text);
			var flag = $('.container.error h1').text().search(/404/);
			if(flag !== -1){clawer.Flag = 404;}
			clawer.Code = Number(url.match(/\d+/)[0]);
			clawer.Title = $('#info h2').text();
			clawer.EngTitle = $('#info h1').text();
			clawer.Comiket = $('#info h1').text().match(/[Cc][5678]\d/)?$('#info h1').text().match(/[Cc][5678]\d/)[0]:'';
			clawer.Parody = [];
			clawer.Character = [];
			clawer.Tag = [];
			clawer.Artist = [];
			clawer.Group = [];
			$('#info div a').each(function(i,e){
				var $e = $(e);
				if($e.attr('href').search(/parody/)!= -1){clawer.Parody.push($e.attr('href').match(/[a-z][^\/]+/g)[1]);}
				if($e.attr('href').search(/character/)!= -1){clawer.Character.push($e.attr('href').match(/[a-z][^\/]+/g)[1]);}
				if($e.attr('href').search(/tagged/)!= -1){clawer.Tag.push($e.attr('href').match(/[a-z][^\/]+/g)[1]);}
				if($e.attr('href').search(/artist/)!= -1){clawer.Artist.push($e.attr('href').match(/[a-z][^\/]+/g)[1]);}
				if($e.attr('href').search(/group/)!= -1){clawer.Group.push($e.attr('href').match(/[a-z][^\/]+/g)[1]);}
			});
			clawer.Language = $('#info div.buttons').prev().prev().prev().text().match(/[A-Z]\w+/g)?$('#info div.buttons').prev().prev().prev().text().match(/[A-Z]\w+/g)[1]:'';
			clawer.Page = $('#info div.buttons').prev().prev().text().match(/\d+/)?Number($('#info div.buttons').prev().prev().text().match(/\d+/)[0]):'';
			clawer.GallleryCode = $('#cover img').attr('src')?Number($('#cover img').attr('src').match(/\d+/)[0]):'';
			clawer.Format = $('.gallerythumb').eq(1).children('div.spinner').attr('data-src')?$('.gallerythumb').eq(1).children('div.spinner').attr('data-src').match(/\w+$/)[0]:'';
			clawer.Favorite = $('div.buttons span.nobold').text()?Number($('div.buttons span.nobold').text().match(/\d+/)[0]):'';
		}else{
			clawer.Flag = 0;
			clawer.Code = Number(url.match(/\d+/)[0]);
		}
		callback(clawer);
	});
}