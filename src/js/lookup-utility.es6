"use strict";
import './lib/runtime.js';
import ajax from './lib/ajax.es6';
import {Popup} from './lib/popup.es6';
import * as pi from './lang/pi.es6';
import {LookupWorker} from './lookup-worker-frontend.es6';
import {textNodes} from './lib/text-nodes.es6';
import {sleep} from './lib/sleep.es6';

let defaultSources =  {
    cped: {
        'brief': 'CPD',
        'name': 'Concise Pali English Dictionary'
    },
    pts_ped: {
        'brief': 'PTS',
        'name': 'PTS Pali English Dictionary'
    },
    dhammika_ff: {
        'brief': 'N&E',
        'name': "Nature and the Environment in Early Buddhism by S. Dhammika"
    },
    sc_dppn: {
        'brief': 'PPN',
        'name': 'Pali Proper Names'
    }
}


class LookupUtility {
  constructor({selector, main, popupClass, lookupWorkerSrc, sources, fromLang, toLang, dataFile, glossaryFile}) {
    this.popups = [];
    this.popupClass = popupClass;

    this.selector = selector;
    this.main = $(main || this.getDefaultMain());
    this.lookupWorkerSrc = lookupWorkerSrc || 'lookup-worker.js';

    this.fromLang = fromLang;
    this.toLang = toLang;

    this.sources = sources || defaultSources;

    this.addHandlers({selector, main});
    this.initWorker({fromLang, toLang, dataFile, glossaryFile});
  }

  progressHandler(event) {
    if (event.data.progress) {
      console.log('Progress: ' + event.data.progress);
    }
  }

  initWorker({fromLang, toLang, dataFile, glossaryFile}) {
    this.lookupWorker = new LookupWorker(this.lookupWorkerSrc);
    this.glossary = new Glossary(this.lookupWorker);
    this.termBreakCache = new TermBreakCache(this.lookupWorker);
    this.ready = this.lookupWorker.init({fromLang, toLang, dataFile, glossaryFile});
    this.ready.then(()=>this.enabled = true);
  }

  mouseoverHandler(event) {
    if (!this.enabled) return
    var target = $(event.target);
    setTimeout(()=> {
      if (target.is(':hover')) {
        Popup.removeAll({removeProtected: true});
        this.lookup({node: event.target, includeGlossary: true});
      }
    }, 50)
  }

  clickHandler(event) {
    if (!this.enabled) return
    Popup.removeAll();
    this.decomposeMode(event.target);
  }

  getDefaultMain(){
    return $('main, body').first();
  }

  addHandlers({selector}) {
    this.main.on('click.lookup', selector, e => this.clickHandler(e));
    this.main.on('mouseover.lookup', selector, e => this.mouseoverHandler(e));
  }

  removeHandlers({main}) {
    if (main === undefined) {
      main = this.getDefaultMain();
    }
    $(main).off('.lookup');
    Popup.removeAll();
  }

  getTerm(node) {
      var term = node.childNodes[0].nodeValue;
      if (!term || term.match(/^\s+$/)) return null
      return term
  }

  async lookup({node, term, indeclinables, parent, includeGlossary, preFn}) {
    if (Popup.hasPopup(node) && !indeclinables) {
      console.log('Already has popup');
      return null;
    }
    if (!term) {
      term = this.getTerm(node);
      console.log('term is null');
      if (term == null) return
    }
    let terms = [term];

    console.log('Lookup: ' + term);
    Popup.removeAll();
    var results = await this.lookupWorker.rank({terms, indeclinables});
    var contentHtml = `<table class="pali">
    ${results.map(hit => `
      <tr${hit.score < 1 ? ' class="poor-match"' : ''}>
        <td class="term">${hit.term}</td>
        <td class="meaning">
          <ul>
          ${hit.entries.map(entry => `
            <li>
              <div class="content">
                ${this.makeSourceTag({source: entry.source})}
                ${entry.html_content}
              </div>
            </li>`).join('')}
          </ul>
        </td>
      </tr>`).join('')}
    </table>`;

    var content = $(contentHtml);
    this.massageEntryContent(content);

    if (includeGlossary) {
      $('<tfoot><tr class="glossary"><td colspan=2></td></tr></tfoot>')
      .appendTo(content)
      .find('td')
      .append(this.glossary.createInputBar(term));
    }
    this.addUnhideBar(content);
    if (preFn) {
      preFn(content);
    }

    var popup = new Popup({
                           parent: node,
                           content: content,
                           protected: false});

    if (popup) {
      popup.element.find('li').addClass('expandable');
      popup.element.on('click', 'li', (event) => {
        $(this).addClass('clicked');
        let entry = $(event.target).is('.content') ? $(event.target) : $(event.target).parents('.content');
        let source = entry.find('[data-source]').attr('data-source');
        this.expandEntry({entry, popup});
        return false
      });

      if (popup.element.tipsy) {
        popup.element.find('[title]').removeAttr('title');
      }
    }
    $(node).removeClass('lookup-in-progress');
  }

  makeSourceTag({source}) {
    return `<span class="source" data-source="${source}" title="${this.sources[source].name}">${this.sources[source].brief}</span>`
  }

  massageEntryContent(content){
    content.find('dt').remove();
    content.find('dd > p:first-child').contents().unwrap();
  }

  addUnhideBar(table) {
    var self = this,
    hiddenCount = table.find('tr.hide').length;

    if (hiddenCount > 0) {
      var string = hiddenCount == 1 ? ' fuzzy result…' : ' fuzzy results…',
      tr = $('<tr><td colspan=2 class="unhide">' + hiddenCount + string + '</td></tr>')
      .appendTo(table);
      tr.one('click', function() {
        table.find('tr.hide')
        .slice(0, hiddenCount == 5 ? 5 : 4)
        .removeClass('hide');
        tr.remove();
        self.addUnhideBar(table);
        if (table.parent().length) {
          table.parent().data('alignFn')();
        }
      });
    }
  }

  async retrieveEntry({term, source}) {
    let result = await this.lookupWorker.getEntry({term});
    if (!result) return null;
    console.log({result})
    for (entry of result.entries) {
      console.log(entry.source, source);
      if (entry.source == source) {
        console.log('Founding matching entry');
        return entry
      }
    }
    return null
  }

  expandEntry({entry, popup}) {
    console.log('Expanding Entry', {entry, popup});

    var textField = $('<div class="popup-text-overlay"/>').html($(entry)[0].outerHTML),
    closeButton = $('<div class="popup-close-button">✖</div>').css('float', 'right');
    textField.children('.content').prepend(closeButton);
    popup.element.append(textField);
    textField.find('[original-title]').attr('original-title', '');
    let content = textField.find('.content');
    let popupHeight = popup.element.height();
    let popupWidth = popup.element.width();
    let contentHeight = content.height();
    textField.height(Math.max(popupHeight, Math.min(contentHeight, popupWidth * 0.6)));

    //textField.css({'min-height': popupHeight});
    setTimeout(function(){
      textField.on('click', e => {
        if ($(e.target).is('.popup-text-overlay, .popup-close-button')) {
          textField.remove();
          return false
        }
      });
    }, 400);

    textField.on('click', 'a', event => {
      event.preventDefault();
      let term = $(event.target).text();
      let source = textField.find('[data-source]').attr('data-source');

      this.retrieveEntry({term: term, source: source}).then(entry => {
        if (entry == null) return
        console.log('Expanding entry', {entry, popup});
        textField.remove();
        let content = $('<div class="content"/>').html(entry.html_content);
        this.massageEntryContent(content);
        content.prepend(this.makeSourceTag({source: entry.source}));
        this.expandEntry({entry: content, popup});
      })
    })
  }

  sanitizeTerm(term) {
    if (this.fromLang == 'pi') {
      term = pi.sanitizeTerm(term);
    }
    return term
  }

    decomposeMode(node) {
      Popup.removeAll({removeProtected: true});
        let term = this.getTerm(node);
        let charRex = /./g;
        term = this.sanitizeTerm(term);
        if (this.fromLang == 'pi') {
          charRex = pi.charRex;
        }
        if (!term) {
          return
        }

        let content = $('<div class="decomposed"/>');

        term.match(charRex).forEach(char => {
            content.append($('<span class="letter"/>').text(char))
        });
        let em = Number(getComputedStyle(node, "").fontSize.match(/(\d*(\.\d*)?)px/)[1])
        let pos = $(node).offset();
        let popupAnchor = $('<span/>').prependTo(node);
        let offset = popupAnchor.offset();
        offset.top -= em / 3;
        offset.left -= em / 2;
        popupAnchor.remove()

        var decomposePopup = new Popup({parent: node, location: offset, content: content, protect: true});
        decomposePopup.element.on('mouseover click', '.letter', event => {
            $('.letter.selected').removeClass('selected');
            var letters = $(event.target).add($(event.target).nextAll());
            letters.addClass('selected');
            var out = letters.map( (i, e) => $(e).text())
                             .get()
                             .join('');
            out = this.sanitizeTerm(out);
            Popup.removeAll({exclude: decomposePopup});

            let decomposed = this.decompose({term, charRex});
            this.lookup({node: node,
                         term: out,
                         indeclinables: decomposed,
                         parent: decomposePopup,
                         preFn: content => {
                             content.find('tr').each( (i, element) => {
                                var tr = $(element),
                                    td = $('<td class="accept">✓</td>'),
                                    thisTerm = tr.children('.term').text();
                                if ((this.termBreakCache.retrieve(term) || []).indexOf(thisTerm) != -1) {
                                    td.addClass('accepted');
                                }
                                tr.append(td);
                            })
                            content.on('click', '.accept', event => {
                              let target = $(event.target);
                                var thisTerm = target.siblings('.term').text();
                                if (target.hasClass('accepted')) {
                                    target.removeClass('accepted');
                                    this.termBreakCache.unstore(term, thisTerm);
                                } else {
                                    this.termBreakCache.store(term, thisTerm);
                                    target.addClass('accepted');
                                }
                            });
                         }
                        })
            return false
        })
    }

    decomposeVowels(term) {
        var table = {
                'a': ['a'],
                'ā': ['ā', 'a'],
                'i': ['i'],
                'ī': ['ī', 'i'],
                'u': ['u'],
                'ū': ['ū', 'u'],
                'e': ['e', 'a', 'i'],
                'o': ['o', 'a', 'u']
            },
            firstChar = term[0],
            lastChar = term.slice(-1),
            terms = [];
        if (table[firstChar]) {
            table[firstChar].forEach(function(char) {
                terms.push(char + term.slice(1));
            })
        } else {
            terms.push(term);
        }
        terms2 = [];
        if (table[lastChar]) {
            terms.forEach(function(term) {
                table[lastChar].forEach(function(char) {
                    terms2.push(term.slice(0, -1) + char);
                });
            });
        } else {
            terms2 = terms;
        }
        return terms2;
    }

    decompose({term, charRex}) {
        var out = [],
            chars = term.match(charRex);

        for (var j = chars.length - 1; j > 0; j--) {
            subTerm = chars.slice(0, j).join('');
            if (subTerm.length <= 2) continue
            out = out.concat(this.decomposeVowels(subTerm));
        }
        return out;
    }
  }

class TermBreakCache {
  constructor(){
    this.storage = {};
    this.mapping = {};
  }

  updateMapping(key) {

    if (key === undefined) {
      _.each(this.storage, (value, key) => {
        this.updateMapping(key);
      });
      return
    }

    for (term of pi.conjugate(key)) {
      this.mapping[term] = key;
    }
  }

  keyize(term) {
    return pi.sanitizeTerm(term);
  }

  store(term, component) {
    var key = this.keyize(term)
    components = this.storage[key] || [];
    if (components.indexOf(component) == -1) {
      components.push(component);
      this.storage[key] = components;
      this.updateMapping(key);
      this.saveToServer();
    }
  }

  unstore(term, component) {
    var key = this.keyize(term),
    components = this.storage[key] || [],
    index = components.indexOf(component);
    if (index >= 0) {
      components.splice(index, 1);
      this.storage[key] = components;
    }
  }

  retrieve(term) {
    var key = this.keyize(term),
    result = this.storage[key];
    if (!result || result.length == 0) {
      var terms = pi.conjugate(key);
      for (var i = 0; i < terms.length; ++i) {
        var mappedTerm = this.mapping[terms[i]];
        if (mappedTerm) {
          result = this.storage[mappedTerm];
          break
        }
      }
    }
    return result
  }

  remove(term) {
    delete this.storage[this.keyize(term)];
  }

  async saveToServer() {
    this.postMessage({'store': {key: 'termBreakCache.user', value: this.storage}})
    sc.paliLookup.client.index({
      index: 'pali-lookup',
      type: 'compounds',
      id: 'localuser',
      body: {
        data: this.storage
      }
    })
  }

  async loadFromServer() {
    var self = this;
    sc.paliLookup.client.get({
      index: 'pali-lookup',
      type: 'compounds',
      id: 'localuser'
    }).then(function(resp) {
      self.storage = resp._source.data;
      self.updateMapping();
    }).fail(function() {
      return
    });
  }
}

class Glossary {
  constructor(lookupWorker){
    this.lookupWorker = lookupWorker;
  }

  addEntry({term, context, gloss, comment}) {
    this.lookupWorker.addGlossaryEntry({term, context, gloss, comment});
  }

  getEntry(term) {
    return this.lookupWorker.getGlossaryEntries({term: term});
  }



  getEntries(terms) {
    return this.lookupWorker.getGlossaryEntries({terms: terms});
  }

  normalizeTerm(term) {
    return term.toLowerCase();
  }

  createInputBar(term) {
    var self = this;
    term = this.normalizeTerm(term);
    var form = $(`<form disabled class="add-glossary-entry">
    <input name="term" value="${term}" required>
    <input name="gloss" placeholder="gloss" value="">
    <input name="context" placeholder="context" value="">
    <input name="comment" placeholder="comment">
    <input name="user" type="hidden" value="user">
    <button>+</button>
    </form>`);

    this.getEntry(term).then( result => {
      console.log({result});
      if (result.length > 0) {
        for (let [name, value] of result.entries()) {
          form.find(`[name=${name}]`).val(value);
        }
      }
    });

    form.on('submit', () => {
      event.preventDefault();

      let items = {};

      for (let {name, value} of form.serializeArray()) {
        items[name] = value;
      }

      if (!items.gloss && !items.comment) {
        return
      }

      items.term = items.term.toLowerCase();

      form.children().attr('disabled', 'disabled');
      self.addEntry(items).then( () => {
        form.find('button').text('✓');
      });
    });
    return form
  }
}

class MarkupGenerator {
  constructor({alphaRex, wordRex, splitRex, lookupClassName}={}) {
    this.alphaRex = alphaRex || /([aiueokgcjtdnpbmyrlvshāīūṭḍṅṇṃñḷ])/i;
    this.wordRex = wordRex || /([aiueokgcjtdnpbmyrlvshāīūṭḍṅṇṃñḷ’­”]+)/ig;
    this.splitRex = splitRex || /(&[a-z]+;|<\??[a-z]+[^>]*>|[^  \n,.– —:;?!"'“‘\/\-]+)/i;
    this.lookupClassName = lookupClassName || 'lookup';
    this.markupOpen = this.getMarkupOpen();
    this.markupClose = this.getMarkupClose();
  }

  getMarkupOpen() {
    return `<span class="${this.lookupClassName}">`;
  }
  getMarkupClose() {
    return `</span>`
  }

  shouldExclude(node) {
    let parent = $(node).parent();
    if (!parent.is(':lang(pi)')) return true;
    if (parent.is('a')) {
      if (parent.parents('h1,h2,h3,h4,h5').length == 0) {
        return false
      }
      return true
    }
    return false
  }

  wrapWords(node) {
    let nodes = textNodes($(node));
    for (let textNode of nodes) {
      let markupOpen = this.markupOpen;
      let markupClose = this.markupClose;
      if (this.shouldExclude(textNode)) {
        return
      }

      var text = textNode.nodeValue;
      if (text.search(self.alphaRex) == -1) {
        return
      }

      var newHtml = text.replace(this.wordRex, (m, word) => {
        return markupOpen + word + markupClose;
      })

      var proxy = $('<span/>')[0];
      textNode.parentNode.replaceChild(proxy, textNode);
      proxy.outerHTML = newHtml;
    }

  }

  startMarkupOnDemand({targetSelector, exclusions}) {
    console.log({targetSelector})
    $('body').on('mouseover.lookupMarkup', targetSelector, event => {
      let target = $(event.target);
      if (!target.is(targetSelector)) {
        return
      }

      if (target.is(exclusions)) {
        return true
      }

      if (target.hasClass('lookup-marked-up')) {
        return
      }

      this.wrapWords(target);

      target.addClass('lookup-marked-up');
    })
  }

  stopMarkupOnDemand() {
    $('body').off('.lookupMarkup');
  }
}

class LoadingPopup {
  constructor(lookupUtility){
    this.lookupUtility = lookupUtility;
    this.popup = this.createPopup();
    this.progressElement = this.popup.element.find('#progress');
    this.handle = lookupUtility.lookupWorker.setMessageHandler( event => this.progressHandler(event));
    lookupUtility.ready.then(() => this.popup.remove(500));

  }

  progressHandler(event) {
    if (event.data.progress) {
      this.progressElement.text(event.data.progress);
    }
  }

  createPopup() {
    let content = $('<div class="loading"><p><em>Lookup is Loading</em></p><p id="progress"></p></div>');
    return new Popup({location: {top: 40, left: 40}, content, parent: document.body});
  }
}


function smartInit(){

  let mouseoverTarget = $('#text, main, body').first();
  let targetSelector = 'p, h1, h2, h3, h4, h5';
  let popupCssClassName = Popup.getDefaultClassName();
  console.time('init');
  lookupUtility = new LookupUtility({selector: `.lookup`,
                                     popupClass: Popup,
                                     fromLang: 'pi',
                                     toLang: 'en'});
  lookupUtility.ready.then(e=> console.timeEnd('init'));
  markupGenerator = new MarkupGenerator();
  markupGenerator.startMarkupOnDemand({targetSelector});

  let loadingPopup = new LoadingPopup(lookupUtility);
  loadingPopup.popup.element.hide();
  setTimeout( ()=> {
    if (lookupUtility.enabled) {

    } else {
      loadingPopup.popup.element.show();
    }
  }, 250);

  return {lookupUtility, markupGenerator}
}

Object.assign(window, smartInit());
window.lookupUtility.lookupWorker.setMessageHandler(function(e){if (e.data.progress) console.log(e.data.progress)});
