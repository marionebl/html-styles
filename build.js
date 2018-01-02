const cheerio = require('cheerio');
const tagNames = require('html-tag-names');
const fetch = require('node-fetch');
const postcss = require('postcss');
const postcssSelectorMatches = require('postcss-selector-matches');
const selectorParser = require('postcss-selector-parser');
const sander = require('@marionebl/sander');

main()
    .catch(err => {
        console.log(err);
        process.exit();
    })

async function main() {
    const html = await getSpecification();
    const $ = cheerio.load(html);

     const code = $('pre.highlight')
        .toArray()
        .map(el => $(el).text())
        .filter(el => el.startsWith('@namespace url(http://www.w3.org/1999/xhtml);'));

    const parser = postcss().use(postcssSelectorMatches);
    const blocks = await Promise.all(code.map(async c => parser.process(c, {from: undefined}).root));
    const results = blocks.reduce((acc, css) => extractRules(acc, css), []);

    await sander.rimraf('./index.json');
    await sander.writeFile('./index.json', JSON.stringify(results, null, '  '));
}

function extractRules(results, css) {
    return css.nodes
        .filter(node => node.type === 'rule')
        .filter(node => !node.selector.startsWith(':root'))
        .reduce((acc, node) => {
            acc.push({
                selectorText: toSelectorText(node.selector),
                type: 'CSSStyleRule',
                style: toStyle(node.nodes)
            });
            return acc;
        }, results);
}

async function getSpecification() {
    if (!await sander.exists('spec.html')) {
        const response = await fetch('https://www.w3.org/TR/html5/rendering.html');
        const html = await response.text();
        await sander.writeFile('spec.html', html);
        return html;
    }

    return sander.readFile('spec.html');
}

function toStyle(nodes) {
    return nodes.reduce((acc, node) => {
        acc[node.prop] = node.value;
        return acc;
    }, {});
}

function toSelectorText(selector) {
    const transform = (selector) => {
        selector.nodes.forEach(node => {
            node.nodes.forEach(n => {
                if (n.type === 'attribute' && !n.quoted && !isNaN(parseInt(n.value, 10))) {
                    n.quoted = true;
                    n.value = `"${n.value}"`;
                }
            });
        });
    }

    return selectorParser(transform).processSync(selector, {lossless: true});
}