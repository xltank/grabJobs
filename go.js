/**
 * Created by Administrator on 2015/5/5.
 */

var promise = require('bluebird'),
    request = promise.promisify(require('request')),
    mkdirp = promise.promisifyAll(require('mkdirp'));


var month = process.argv[2] || '2015-03' ;

var domain = "http://epaper.comnews.cn",
    mainUrl = domain+"/list.php?page={page}&tid=1";

var pageContent = "",
    currentPage = 1;

var concurrency = 5;


// ########## utils

function getHTMLBody(url){
    return request(url)
        .then(function(r){
            if(r[0].statusCode != 200)
                throw new Error("error when getting "+url);

            var str = r[1];
            console.log('Got HTML body from '+ url);
            return str.substring(str.indexOf("<body>"), str.indexOf("</body>"));
        })
}


function uniqueSimpleArray(arr){
    arr.sort();
    for(var i=0; i<arr.length; i++){
        if(i >= arr.length-1)
            break;

        if(arr[i] == arr[i+1]){
            arr.splice(i+1, 1);
            i--;
        }
    }
    return arr;
}

function uniqueArray(arr, key){
    arr.sort(function(a, b){
        return a[key] < b[key] ? -1 : 1;
    });

    for(var i=0; i<arr.length; i++){
        if(i >= arr.length-1)
            break;

        if(arr[i][key] == arr[i+1][key]){
            arr.splice(i+1, 1);
            i--;
        }
    }
    return arr;
}


// ########## page // <a href="http://epaper.comnews.cn/read-1977.html">第 8233 期 2015-05-05</a>
//var currentMonthPaperUrlRegExp = new RegExp('<a href="([^"]+)">(第 \\d+ 期) '+month+'-([^<]*)<\/a>', 'g');
var paperUrlRegExp = new RegExp('<a href="([^"]+)">第 (\\d+) 期 (\\d+-\\d+-\\d+)<\/a>', 'g');

function getPageContent(page){
    return getHTMLBody(mainUrl.replace("{page}", page));
}



function getPaperItem(c){
    var result = [];
    var a = paperUrlRegExp.exec(c);
    while(a != null){
        result.push({
            raw  : a[0],  // <a href="http://epaper.comnews.cn/read-1979.html">第 8234 期 2015-05-06</a>
            name : a[2],  // 8234
            url  : a[1],  // http://epaper.comnews.cn/read-1979.html
            date : a[3]   // 2015-05-06
        });
        a = paperUrlRegExp.exec(c);
    }
    return result;
}



/*function getFirstPaperMonth(c){
 return paperUrlRegExp.exec(c)[3]; // 2015-05-06
 }*/



// ##########  block  // <a href="http://epaper.comnews.cn/read-1921-40512.html">A1版 要闻</a>

var blockUrlRegExp = new RegExp('<a href="(http://epaper.comnews.cn/read-\\d+-\\d+.html)">[^<]*</a>', 'g');

function getBlockItems(paperItem){
    return getHTMLBody(paperItem.url)
        .then(function(b){
            var arr = [];
            var a = blockUrlRegExp.exec(b);
            while(a != null){
                arr.push({
                    raw  : a[0],  // <a href="http://epaper.comnews.cn/read-1921-40512.html">A1版 要闻</a>
                    url  : a[1],  // http://epaper.comnews.cn/read-1921-40512.html
                    name : a[2],   // A1版 要闻
                    paper: paperItem
                });
                a = blockUrlRegExp.exec(b);
            }
            return uniqueArray(arr, 'url');
        })
}

function getBlockContentFromPaper(paperItems){
    console.log(' --- paperItems count '+paperItems.length);
    return promise.map(paperItems, function(paperItem){
        return getBlockItems(paperItem);
    }, {concurrency: concurrency})
        .then(function(blockUrlListArray){
            var arr = [];
            for(var i in blockUrlListArray){
                arr = arr.concat(blockUrlListArray[i]);
            }
            console.log('block count: ' + arr.length);
            return arr;
        })
}



// ##########  article  // <a class="fcslnk" style="width:317px; height:239px; top:66px; left:15px;" href="http://epaper.comnews.cn/news-1095551.html" target="_blank" title="计算机出口受制市场需求"></a>

var articleRegExp = new RegExp('href="(http://epaper.comnews.cn/news-\\d+.html)" target="_blank" title="([^"]*)"');

function getArticleItem(blockItem){
    return getHTMLBody(blockItem.url)
        .then(function(b){
            var arr = [];
            var a = blockUrlRegExp.exec(b);
            while(a != null){
                arr.push({
                    raw  : a[0],  // href="http://epaper.comnews.cn/news-1095551.html" target="_blank" title="计算机出口受制市场需求"
                    url  : a[1],  // http://epaper.comnews.cn/news-1095551.html
                    name : a[2],  // 计算机出口受制市场需求
                    block: blockItem
                });
                a = blockUrlRegExp.exec(b);
            }
            return arr;
        })
}

function getArticleFromBlock(blockItems){
    console.log(' --- block count '+blockItems.length);
    return promise.map(blockItems, function(blockItem){
        return getArticleItem(blockItem);
    }, {concurrency: concurrency})
        .then(function(articleItemListArray){
            var arr = [];
            for(var i in articleItemListArray){
                arr = arr.concat(articleItemListArray[i]);
            }
            console.log('article count: ' + arr.length);
            return arr;
        })
}


// ########## // <div class="n_detail_from"> 作者：沈娟</div>
var authorRegExp = new RegExp('<div class="n_detail_from"> 作者：([^<]+)</div>')

function getAuthorFromArticle(articleItems){
    console.log(' --- article count '+articleItems.length);
    return promise.map(articleItems, function(articleItem){
        getHTMLBody(articleItem.url)
            .then(function(r){
                var result = authorRegExp.exec(r);
                if(result)
                    return {author: result[1], article: articleItem};

                return null;
            })
    }, {concurrency: concurrency})
        .then(function(r){
            return r;
        })
}




// ##########

var currentPage = 1;
var paperItems = [] ;

function getPaperUrls(){
    getPageContent(currentPage)
        .then(function(c){
            var arr = getPaperItem(c);
            arr.sort(function(a, b){
                return a.date < b.date ? 1 : -1;
            })
            var firstPaperDate = arr[0].date;
            console.log('first paper date in page '+currentPage+' : '+ firstPaperDate);

            if(month > firstPaperDate){
                if(currentPage == 1)
                    throw new Error('Invalid month.');

                var filteredPaperItems = [];
                for(var i=0; i<paperItems.length; i++){
                    var paperItem = paperItems[i];
                    if(paperItem.date.indexOf(month) == 0)
                        filteredPaperItems.push(paperItem);
                }
                paperItems = filteredPaperItems;

                console.log("got all paper urls, start getting block urls ...");
                getBlockContentFromPaper(paperItems)
                    .then(getArticleFromBlock)
                    .then(getAuthorFromArticle)
                    .then(function(articles){
                        console.log(articles.length);
                    });
            }else{
                if(arr.length > 0)
                    paperItems.push.apply(paperItems, arr);

                getPaperUrls(currentPage++);
            }
        });
}


function go(){
    getPaperUrls();
}

go(); 