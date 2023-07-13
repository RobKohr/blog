import fs from "fs";
import { marked } from "marked";

/* Get html content from analytics.html */
var headerExtras = `
${fs.readFileSync("analytics.html", "utf8")}
<link rel="alternate" type="application/rss+xml" title="RobKohr's Blog" href="rss.xml" />
<link rel="shortcut icon" type="image/ico" href="favicon.ico">
<link rel="stylesheet" href="libs/highlight/styles/dark.min.css">
<script src="libs/highlight/highlight.min.js"></script>
`;

/* 
A function that will take a string like this:
![[Yeast starter.jpg]]
and replace it with this:
<img src="Yeast starter.jpg" alt="Yeast starter" />
*/

function replaceImageLinks(text) {
  return text.replace(/!\[\[(.+)\]\]/g, '<img src="images/$1" alt="$1" style="max-width: 100%;" />');
}

/* 
remove link tags from any youtube urls and replace them with an iframe 
Also allow for query parameters to be passed to the youtube url
*/
function convertYoutubeUrlsIntoHtml(text) {
  return text.replace(
    /<a href="https:\/\/www.youtube.com\/watch\?v=(\w+)">(.+)<\/a>/g,
    '<div><iframe width="560" height="315" src="https://www.youtube.com/embed/$1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
  );
}

function htmlUpdaters(text) {
  return convertYoutubeUrlsIntoHtml(replaceImageLinks(text));
}

marked.use({
  gfm: true,
  headerIds: false,
  mangle: false,
});

console.log("starting app");
/* read file from blog.md in a synchronous way */

var data = fs.readFileSync("blog.md", "utf8");
/* split data by ## */
var articlesFull = data.split("\n## ");

var tagPages = {};

var articles = articlesFull.map(function (articleOrig) {
  const article = {}
  var lines = articleOrig.split("\n");
  article.title = lines[0].trim();
  article.content = lines.slice(1).join("\n").trim();
  /* 
        content contains variables that start with @date= or @tags=
        Those lines should be removed from the content and added to the article object
        */
  article.variables = {};

  article.content = article.content.replace(/@(\w+)=(.*)/g, function (match, key, value) {
    value = value.trim();
    if (key === "tags") {
      value = value
        .split(",")
        .map(function (tagLabel) {
          tagLabel = tagLabel.trim();
          if (tagLabel === "") {
            return "";
          }
          let tagLink = `<a href="tags/${tagLabel}">${tagLabel}</a>`;
          return {
            label: tagLabel,
            link: tagLink,
          };
        })
        .filter(function (tag) {
          return tag !== "";
        });
    }
    article.variables[key] = value;
    return "";
  });

  article.html = htmlUpdaters(marked.parse(article.content));
  const htmlHasAtLeastOneImageTag = article.html.match(/<img.+>/g);
  const contentWithoutVariables = article.content.replace(/@(\w+)=(.*)/g, "");
  const contentWithoutImages = contentWithoutVariables.replace(/!\[\[(.+)\]\]/g, "");
  const contentWithoutATags = contentWithoutImages.replace(/<a href="(.+)">(.+)<\/a>/g, "");
  const wordCount = article.content.split(" ").length;
  const summaryLength = 300;
  const hasReadMore = contentWithoutATags.length > summaryLength;
  article.summary =  htmlUpdaters(contentWithoutATags.substring(0, 300)+` <a class="nowrap" href="${articleUrl(article)}">... read more (${wordCount} words)...</a> `).replace(/<img.+>/g, "");
  if(!hasReadMore && !htmlHasAtLeastOneImageTag){
    article.summary = article.html;
  }
  let icon = article.html.match(/<img src="(.+)" alt="(.+)" style="max-width: 100%;" \/>/);
  if (icon) {
    icon = `<a href="${ articleUrl(article)}">${icon[0].replace("img", 'img class="icon"')}</a>`
  } else {
    icon = "";
  }
  article.icon = icon;


  /*
        convert markdown content to html
    */
  /* if variable publishDate is in the future, then skip this article */
  if (article.variables.publishDate && new Date(article.variables.publishDate) > new Date()) {
    return null;
  }

  if ((!article.variables.tags || article.variables.tags.length === 0) && (article.variables.date)){
    article.variables.tags = [{ label: "untagged", link: `<a href="tags/untagged">untagged</a>` }];
  }

  /* if variable tags is set, then add this article to the tag page */
  if (article.variables.tags) {
    article.variables.tags.forEach(function (tag) {
      if (!tagPages[tag.label]) {
        tagPages[tag.label] = [];
      }
      tagPages[tag.label].push(article);
    });
  }

  return article
});

/* go through articles if title is not unique, then add date to title */
var titles = {};
articles.forEach(function (article) {
  if (!article) {
    return;
  }
  if (titles[article.title]) {
    article.title = article.title + article.variables.date;
  }
});

let output = `
    <html>
        <head>
            <title>RobKohr's Blog</title>
${headerExtras}
            <link rel="stylesheet" href="neat.css">
        </head>
        <body>
        <p></p>
        <img src="headshot.png" alt="Rob Kohr" style="max-width: 105px;float:left;margin:2em;border-radius:1em;" />
        <h1>RobKohr's Blog</h1>
        <p><i>
        My father says almost the whole world's asleep. Everybody you know, everybody you see, everybody you talk to. He says only a few people are awake. And they live in a state of constant total amazement.
        </i><br/>
        -Joe Vs. The Volcano
        
        </p>
`;

function toKebab (str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .trim();
};

function articleUrl(article) {
  return `articles/${toKebab(article.title)}`;
}

function addArticleToOutput(article, output, full) {
  const kabab = toKebab(article.title);
  if (article === null || !article.title || !article.content) {
    return output;
  }
  let tags = article.variables?.tags?.reduce(function (output, tag, index, array) {
    return output + tag.link + (index < array.length - 1 ? ", " : "");
  }, "");

  return (
    output +
    `
    <h2><a href="articles/${kabab}">${article.title}</a></h2>
    <div class="variables">
    <div class="date">${article.variables.date ? `@date=${article.variables.date}` : ""}</div>
    <div class="tags">${tags ? `@tags=${tags}` : ""}</div>
    </div>
    <article>
        ${full ? article.html: article.icon + article.summary}
    </article>
    `
  );
}

articles.forEach(function (article) {
  if (article === null) {
    return;
  }
  if (!article.variables.page) {
    output = addArticleToOutput(article, output);
  }
  const articleStartHtml = `
        <html>
            <head>
                <title>${article.title} - RobKohr's Blog</title>
${headerExtras}
                <link rel="stylesheet" href="../neat.css">
                <base href="../">
            </head>
            <body>
            <a href="./index.html">Home</a>
            `;
  const articleEndHtml = `
            </body>
          </html>
          `;
  const articleHtml = articleStartHtml + addArticleToOutput(article, "", true) + articleEndHtml;
  const filename = `${toKebab(article.title)}`;
  if (filename) {
    fs.writeFileSync(`articles/${filename}`, articleHtml);
  }
});
output += `
        </body>
    </html>
`;
fs.writeFileSync("index.html", output);

Object.keys(tagPages).forEach(function (tag) {
  let output = `
        <html>
            <head>
                <title>${tag} - RobKohr's Blog</title>
${headerExtras}
                <link rel="stylesheet" href="../neat.css">
                <base href="../">
            </head>
            <body>
            <a href="./index.html">Home</a>
            <h2>Tag: ${tag}</h2>
    `;
  tagPages[tag].forEach(function (article) {
    output = addArticleToOutput(article, output);
  });
  output += `
            </body>
        </html>
    `;
  if (tag === "") {
  }
  fs.writeFileSync(`tags/${tag}`, output);
});

/* Create an index page that lists all the tags and the count of articles under each tag */
output = `
    <html>
        <head>
            <title>Tags - RobKohr's Blog</title>
${headerExtras}
            <link rel="stylesheet" href="../neat.css">
            <base href="../">
        </head>
        <body>
        <a href="./index.html">Home</a>
        <h2>Tags</h2>
`;

const tagsSortedByArticleCountDesc = Object.keys(tagPages).sort(function (a, b) {
  return tagPages[b].length - tagPages[a].length;
});

tagsSortedByArticleCountDesc.forEach(function (tag) {
  output += `<a href="tags/${tag}">${tag}</a> (${tagPages[tag].length})<br/>`;
});
output += `
        </body>
    </html>
`;
fs.writeFileSync(`tags/index.html`, output);

/* create a date string, but set the time to midnight */
const date = new Date();
const basicDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toUTCString();

/* create an rss feed of the last 50 articles */
output = `
    <rss version="2.0">
        <channel>
            <title>RobKohr's Blog</title>
            <link>https://robkohr.com</link>
            <description>RobKohr's Blog</description>
            <language>en-us</language>
            <lastBuildDate>${basicDate}</lastBuildDate>
            <pubDate>${basicDate}</pubDate>
            <ttl>1800</ttl>
`;
articles
  .filter(function (article) {
    return article !== null;
  })
  .filter(function (article) {
    //remove articles that have no date
    return article.variables.date;
  })
  .sort(function (a, b) {
    return new Date(b.variables.date) - new Date(a.variables.date);
  })
  .slice(0, 50)
  .forEach(function (article) {
    /* create a utc string date from article.variables.date, correcting issue where month is off by one */
    const date = new Date(article.variables.date);
    date.setMonth(date.getMonth() - 1);
    const dateString = date.toUTCString();
    output += `
            <item>
                <title>${article.title}</title>
                <link>https://robkohr.com/articles/${toKebab(article.title)}</link>
                <description>${article.title}</description>
                <pubDate>${dateString}</pubDate>
            </item>
    `;
  });
output += `
        </channel>
    </rss>
`;
fs.writeFileSync(`rss.xml`, output);

console.log("done");
