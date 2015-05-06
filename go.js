/**
 * Created by Administrator on 2015/5/5.
 */

var promise = require('bluebird'),
    request = promise.promisify(require('request')),
    mkdirp = promise.promisifyAll(require('mkdirp'));


var month = process.argv[2];

var domain = "http://epaper.comnews.cn",
    mainUrl = domain+"/list.php?page={page}&tid=1";

var pageContent = "",
    currentPage = 1;


var paperUrlRegExp = /<a href="([^"]+)">第 (\d+) 期 2015-05([^<]*)<\/a>/g;

/**
 * <a href="http://epaper.comnews.cn/read-1977.html">第 8233 期 2015-05-05</a>
 *
 */

// ########## utils

function getHTMLBody(url){
    return request(url)
        .then(function(r){
            if(r[0].statusCode != 200)
                throw new Error("error when getting "+url);

            var str = r[1];
            return str.substring(str.indexOf("<body>"), str.indexOf("</body>"));
        })
}

function getPageContent(page){
    return getHTMLBody(mainUrl.replace("{page}", page));
}


function execpaperUrlRegExp(c, regExp){
    var result = [];
    var a = regExp.exec(c);
    while(a != null){
        result.push({
            pageUrl: a[1], // http://epaper.comnews.cn/read-1979.html
            number: a[2],  // 8234
            date: a[3],    // -06
            raw: a[0]      // <a href="http://epaper.comnews.cn/read-1979.html">第 8234 期 2015-05-06</a>
        });
        a = regExp.exec(c);
    }
    return result;
}

// ##########

function getPaperUrl(content){
}



function go(){
    var i = 1;
    var paperUrls ;
    return getPageContent(i)
        .then(function(c){
            paperUrls = execpaperUrlRegExp(c, paperUrlRegExp);
            console.log(paperUrls);
        })
}

go();