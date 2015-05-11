/**
 * Created by Administrator on 2015/5/5.
 */

var promise = require('bluebird'),
    request = promise.promisify(require('request')),
    fs = require('fs'),
    mkdirp = promise.promisify(require('mkdirp'));


var month = process.argv[2] || '2015-04' ;

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

function filter(arr, key, values){
    var result = [];
    for(var i=0; i<arr.length; i++){
        for(var j=0; j<values.length; j++){
            if(arr[i][key].indexOf(values[j]) >= 0)
                result.push(arr[i]);
        }
    }
    return result;
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

var blockUrlRegExp = new RegExp('<a href="(http://epaper.comnews.cn/read-\\d+-\\d+.html)">([^<]*)</a>', 'g');

function getBlockItems(paperItem){
    return getHTMLBody(paperItem.url)
        .then(function(b){
            var arr = [];
            var a = blockUrlRegExp.exec(b);
            while(a != null){
                if(a.length == 3){
                    var t = a[2].match(/市场|要闻|观察/g);
                    if(t && t.length > 0) {
                        arr.push({
                            raw: a[0],  // <a href="http://epaper.comnews.cn/read-1921-40512.html">A1版 要闻</a>
                            url: a[1],  // http://epaper.comnews.cn/read-1921-40512.html
                            name: a[2],   // A1版 要闻
                            paper: paperItem
                        });
                    }
                }
                a = blockUrlRegExp.exec(b);
            }
//            return uniqueArray(arr, 'url');
            return arr;
        })
}

function getBlockContentFromPaper(paperItems){
    return promise.map(paperItems, function(paperItem){
        return getBlockItems(paperItem);
    }, {concurrency: concurrency})
        .then(function(blockUrlListArray){
            var arr = [];
            for(var i in blockUrlListArray){
                arr = arr.concat(blockUrlListArray[i]);
            }
            return arr;
        })
}



// ##########  article  // <a class="fcslnk" style="width:317px; height:239px; top:66px; left:15px;" href="http://epaper.comnews.cn/news-1095551.html" target="_blank" title="计算机出口受制市场需求"></a>

var articleRegExp = new RegExp('href="(http://epaper.comnews.cn/news-\\d+.html)" target="_blank" title="([^"]*)"', 'g');

function getArticleItem(blockItem){
    return getHTMLBody(blockItem.url)
        .then(function(b){
            var arr = [];
            var a = articleRegExp.exec(b);
            while(a != null){
                arr.push({
                    raw  : a[0],  // href="http://epaper.comnews.cn/news-1095551.html" target="_blank" title="计算机出口受制市场需求"
                    url  : a[1],  // http://epaper.comnews.cn/news-1095551.html
                    name : a[2],  // 计算机出口受制市场需求
                    block: blockItem
                });
                a = articleRegExp.exec(b);
            }
            console.log(arr.length+' articles in block '+blockItem.name);
            return arr;
        })
}

function getArticleFromBlock(blockItems){
    return promise.map(blockItems, function(blockItem){
        return getArticleItem(blockItem);
    }, {concurrency: concurrency})
        .then(function(articleItemListArray){
            var arr = [];
            for(var i in articleItemListArray){
                arr = arr.concat(articleItemListArray[i]);
            }
            return arr;
        })
}


// ########## // <div class="n_detail_from"> 作者：沈娟</div>
var authorRegExp = new RegExp('<div class="n_detail_from"> 作者：([^<]+)</div>')

function getAuthorFromArticle(articleItems){
    return promise.map(articleItems, function(articleItem){
        return getHTMLBody(articleItem.url)
            .then(function(r){
                var result = authorRegExp.exec(r);
                if(result){
                    articleItem.author = result[1];
                    return articleItem;
//                    return {author: result[1], article: articleItem};
                }

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
            });
            var firstPaperDate = arr[0].date;
            console.log('first paper date in page '+currentPage+' : '+ firstPaperDate);

            if(month > firstPaperDate){
                if(currentPage == 1)
                    throw new Error('Invalid month.');

                paperItems = filter(paperItems, 'date', [month]);
                console.log(' --- paperItems count '+paperItems.length);

                getBlockContentFromPaper(paperItems)
                    .then(function(blockItems){
                        console.log(' --- block count '+ blockItems.length);
                        return getArticleFromBlock(blockItems);
                    })
                    .then(function(articleItems){
                        console.log(' --- article count '+articleItems.length);
                        return getAuthorFromArticle(articleItems);
                    })
                    .then(function(authors){
//                        console.log(authors.length);
                        return authors;
                    })
                    .filter(function(a){
                        return a && a.author.indexOf('沈娟') >=0;
                    })
                    .then(function(shens){
                        console.log(shens.length+' articles of Shen');
                        var result = '';
                        for(var i=0; i<shens.length; i++){
                            var article = shens[i];
                            var record= article.block.paper.date+' '+
                                        article.name+' '+
                                        article.block.name+' '+
                                        article.author+' '+
                                        article.block.paper.name+' '+
                                        article.url;
                            console.log(record);
                            result += record + '\n';
                        }
                        mkdirp('results')
                            .then(function(){
                                fs.writeFileSync('results/result_'+new Date().getTime(), result);
                            })
                    })
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