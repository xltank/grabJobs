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


// ########## utils

function getHTMLBody(url){
    return request(url)
        .then(function(r){
            if(r[0].statusCode != 200)
                throw new Error("get error when getting page "+ index);

            var str = r[1];
            return str.substring(str.indexOf("<body>"), str.indexOf("</body>"));
        })
}


// ##########

function getPageContent(index){
    return getHTMLBody(mainUrl.replace("{page}", index))
}
