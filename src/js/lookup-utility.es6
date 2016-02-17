"use strict";
import './lib/runtime.js';
import ajax from './lib/ajax.es6';
import {Popup} from './lib/popup.es6';
import * as pi from './lang/pi.es6';
import {LookupWorker} from './lookup-worker-frontend.es6';
import {textNodes} from './lib/text-nodes.es6';
import {sleep} from './lib/sleep.es6';
import {getEmPixelSize} from './lib/em-calculator.es6';
import timeStamp from './lib/timestamp';

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


export default class LookupUtility {
  constructor({selectorClass, main, popupClass, lookupWorkerSrc, sources, fromLang, toLang, dataFile, glossaryFile, includeSettings}) {
    this.popups = [];
    this.popupClass = popupClass || Popup;
    this.includeSettings = includeSettings === false ? false : true;

    this.selectorClass = selectorClass;
    this.main = $(main || this.getDefaultMain());
    this.lookupWorkerSrc = lookupWorkerSrc || 'lookup-worker.js';

    this.fromLang = fromLang;
    this.toLang = toLang;

    this.sources = sources || defaultSources;
    this.markupGenerator = new MarkupGenerator({selectorClass});
    this.addHandlers({selectorClass, main});
    this.ready = this.initWorker({fromLang, toLang, dataFile, glossaryFile}).then( () => {
      this.glossary = new Glossary({lookupUtility: this});
      this.termBreakCache = new TermBreakCache({lookupWorker: this.lookupWorker});
      this.termBreakCache.loadFromServer();

      this.enabled = true;
    })

  }

  makeLoadingPopup() {
    this.loadingPopup = new LoadingPopup({lookupUtility: this});
    return this.loadingPopup;

  }

  progressHandler(event) {
    if (event.data.progress) {
      //console.log('Progress: ' + event.data.progress);
    }
  }

  async initWorker({fromLang, toLang, dataFile, glossaryFile}) {
    let lookupWorker = this.lookupWorker = new LookupWorker(this.lookupWorkerSrc);
    return lookupWorker.init({fromLang, toLang, dataFile, glossaryFile});

  }

  mouseoverHandler(event) {
    if (!this.enabled) return
    var target = $(event.target);
    ////console.log('mouseover', target);
    setTimeout(()=> {
      if (target.is(':hover')) {
        Popup.removeAll({removeProtected: true});
        this.lookup({node: event.target, includeGlossary: true, useTermBreak: true});
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

  addHandlers({selectorClass}) {
    this.main.on('click.lookup', `.${selectorClass}`, e => this.clickHandler(e));
    this.main.on('mouseover.lookup', `.${selectorClass}`, e => this.mouseoverHandler(e));
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
      if (!term || term.match(/^\s+$/)) return null;
      return term.toLowerCase();
  }

  async lookup({node,
                term,
                indeclinables,
                parent,
                absoluteLocation,
                useTermBreak,
                includeGlossary,
                includeSettings,
                excludeFuzzy,
                preFn}) {

    if ($(node).hasClass('lookup-in-progress') && !indeclinables) {
      ////console.log('Already has popup', Popup.getPopup(node));
      return null;
    }
    $(node).addClass('lookup-in-progress');
    if (!term) {
      term = this.getTerm(node);
      ////console.log('term is null');
      if (term == null) return
    }
    let terms = [term];
    let termBreak = undefined;
    if (useTermBreak) {
      termBreak = this.termBreakCache.retrieve(term);
    }
    ////console.log({termBreak})

    ////console.log('Lookup: ' + term);
    var results = await this.lookupWorker.rank({terms, indeclinables, priorityTerms: termBreak, excludeFuzzy});
    var contentHtml = `<table class="pali">
    ${results.map(hit => `
      <tr${hit.score < 1 ? ' class="poor-match hide"' : ''}>
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
    contentHtml = contentHtml.replace(/\s*\n\s*/g, '\n');
    var content = $(contentHtml);
    this.massageEntryContent(content);

    if (includeGlossary) {
      $('<tfoot><tr class="glossary"><td colspan=2></td></tr></tfoot>')
      .appendTo(content)
      .find('td')
      .append(this.glossary.createInputBar(term));
    }

    if (preFn) {
      preFn(content);
    }

    var popup = new Popup({absoluteLocation,
                           parent: node,
                           content: content,
                           protected: false,
                           includeSettings});

    if (popup) {
      if (this.includeSettings && includeSettings !== false) {
        this.addSettings({popup});
      }
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
      this.addUnhideBar({popup});
    }
    popup.align();
    $(node).removeClass('lookup-in-progress');
  }

  addSettings({popup}) {
    //$(popup.element).find('table').prepend('<thead><tr><td colspan=0><div class="settings-wrap"><div title="Lookup Settings" class="settings-cog">\u2699</div></div></td></tr></thead>');

    if ($(popup.element).find('tbody tr').length == 0){
      return
    }

    $('<div class="settings-wrap"><div title="Lookup Settings" class="settings-cog">\u2699</div></div>')
      .prependTo(popup.element)
      .on('click', (e) => this.makeSettingsPopup());



  }

  makeSettingsPopup() {
    let content = $(`
      <aside class="settings">
        <div class="settings-darkness"></div>
        <div class="inner">
          <h3>Settings</h3>
<ul>

          <li id="download-data"><label>Download User Data <button type="button" id="get-download-link">Get Link</button></label>

          <li id="upload-data"><label>Upload User Data <input type="file" id="upload-data-file" name="upload-data-file"/></label>

          <li id="clear-data"><label>Clear User Data <label>(I'm sure <input type="checkbox" id="clear-sure" name="clear-sure">)</label> <button type="button" id="clear-user-data" disabled=disabled>Boom</button></label>
</ul>
        </div>
      </aside>`)
    let popup = new Popup({fixedLocation: {left: '2em', top: '2em'}, content, protect: true})
    popup.element.find('.settings-darkness').on('click', (e)=>popup.remove());
    popup.element.css({'max-width': 'inherit'});
    // Download using data URL
    let getDownloadLink = popup.element.find('#get-download-link');
    getDownloadLink.on('click', (e) => {
      e.preventDefault();
      this.dumpUserData().then( data => {
        console.log(data);
        let dataString = "text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        let timestamp = timeStamp();
        let filename = `lookup-user-data-${timestamp}.json`;
        $(` <a href="data:${dataString}" download="${filename}">download as JSON</a>`)
          .appendTo($('#download-data'));
        getDownloadLink.attr('disabled', 'disabled');
      })

    })

    // Boom (Clear data)
    let clearSure = popup.element.find('#clear-sure');
    let clearUserData = popup.element.find('#clear-user-data');
    clearSure.on('change', (e) => {
      console.log(clearSure.prop('checked'));
      if (clearSure.prop('checked')) {
        clearUserData.removeAttr('disabled');
      } else {
        clearUserData.attr('disabled', 'disabled');
      }
    })

    clearUserData.on('click', (e) => {
      e.preventDefault();
      this.clearUserData();
      setTimeout(() => clearUserData.attr('disabled', 'disabled'), 50);
    })

    // Upload data using File API

    let uploadDataFile = popup.element.find('#upload-data-file');

    uploadDataFile.on('change', (e) => {
      let files = e.target.files;
      let file = files[0];
      if (!file) return

      let reader = new FileReader();
      reader.onload = () => {
        let data = JSON.parse(reader.result);
        this.loadUserData({data});
        popup.element.find('#upload-data').append(' <i>… uploaded.</i>');
        uploadDataFile.attr('disabled', 'disabled');
      }
      reader.readAsText(file);
    })
  }

  makeSourceTag({source}) {
    return `<span class="source" data-source="${source}" title="${this.sources[source].name}">${this.sources[source].brief}</span>`
  }

  massageEntryContent(content){
    content.find('dt').remove();
    content.find('dd > p:first-child').contents().unwrap();
  }

  addUnhideBar({popup}) {
    let table = popup.element.find('table');
    let hiddenCount = table.find('tr.hide td.term').length;
    let totalCount = table.find('tr td.term').length;
    ////console.log({hiddenCount, totalCount})
    if (hiddenCount == totalCount) {
      table.find('tr.hide').removeClass('hide');
      return
    }
    if (hiddenCount > 0) {
      let tr = $(`<tr><td colspan=3 class="unhide"><a style="width: 100%; display: inline-block;" title="Fuzzy results bear some resemblence but are less likely to be actually a correct match">${hiddenCount} ${hiddenCount == 1 ? ' fuzzy result…' : ' fuzzy results…'}</a></td></tr>`)
              .appendTo(table);
      popup.align();
      tr.find('a').one('click', (event) => {
        event.preventDefault();
        table.find('tr.hide')
             .slice(0, hiddenCount == 5 ? 5 : 4)
             .removeClass('hide');
        tr.remove();
        this.addUnhideBar({popup});
        popup.align();
        popup.align();
      })
    }
  }

  async retrieveEntry({term, source}) {
    let result = await this.lookupWorker.getEntry({term});
    if (!result) return null;
    ////console.log({result})
    for (entry of result.entries) {
      ////console.log(entry.source, source);
      if (entry.source == source) {
        ////console.log('Founding matching entry');
        return entry
      }
    }
    return null
  }

  expandEntry({entry, popup}) {
    ////console.log('Expanding Entry', {entry, popup});

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
        ////console.log('Expanding entry', {entry, popup});
        textField.remove();
        let content = $('<div class="content"/>').html(entry.html_content);
        this.massageEntryContent(content);
        content.prepend(this.makeSourceTag({source: entry.source}));
        this.expandEntry({entry: content, popup});
      })
    })
  }

  sanitizeTerm(term) {
    term = term.toLowerCase();
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
    let em = getEmPixelSize(node);
    let pos = $(node).offset();
    $(node).css({display: 'inline-block'})
    let popupAnchor = $('<span class="popup-anchor" style="display: inline-block"/>').prependTo(node);
    let offset = popupAnchor.offset();
    offset.top -= 1.0 * em;
    offset.left -= 1.0 * em;
    popupAnchor.remove()
    $(node).css({display: ''})


    var decomposePopup = new Popup({parent: node, absoluteLocation: offset, content: content, protect: true});
    ////console.log({decomposePopup, offset})
    decomposePopup.element.on('mouseover click', '.letter', event => {
      $('.letter.selected').removeClass('selected');
      var letters = $(event.target).add($(event.target).nextAll());
      letters.addClass('selected');
      var out = letters.map( (i, e) => $(e).text())
      .get()
      .join('');
      out = this.sanitizeTerm(out);
      Popup.removeAll({exclude: decomposePopup});

      let decomposed = this.decompose({term: out, charRex});
      ////console.log({out, decomposed});
      this.lookup({node: node,
        term: out,
        indeclinables: decomposed,
        excludeFuzzy: true,
        parent: decomposePopup,
        includeSettings: false,
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

  async dumpUserData() {
    let glossaryData = await this.glossary.getAllUserEntries();
    let termBreakData = this.termBreakCache.storage;

    return {glossaryData, termBreakData}
  }

  async loadUserData({data}) {
    this.termBreakCache.mergeEntries(data.termBreakData);
    this.glossary.lookupWorker.addGlossaryEntries({entries: data.glossaryData, origin: 'user'})
  }

  async clearUserData() {
    this.termBreakCache.storage = {};
    this.termBreakCache.mapping = {};
    this.termBreakCache.saveToServer();

    this.glossary.lookupWorker.removeGlossaryEntries({origin: 'user'})
  }

}



class TermBreakCache {
  constructor({lookupWorker}){
    this.storage = {};
    this.mapping = {};
    this.lookupWorker = lookupWorker;
  }

  mergeEntries(termBreakData) {
    Object.assign(this.storage, termBreakData);
    this.updateMapping();
    this.saveToServer();
  }

  updateMapping(key) {
    if (key === undefined) {
      for (key of Object.keys(this.storage)) {
        this.updateMapping(key);
      }
    } else {
      for (term of pi.conjugate(key)) {
        this.mapping[term] = key;
      }
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

  saveToServer() {
    this.lookupWorker.store({key: 'termBreakCache.user', value: this.storage})
  }

  async loadFromServer() {
    let result = await this.lookupWorker.retrieve({key: 'termBreakCache.user'});
    if (result && result.value) {
      this.storage = result.value;
      this.updateMapping();
    } else {
      this.storage = {};
    }
  }
}

class Glossary {
  constructor({lookupUtility}){
    this.lookupUtility = lookupUtility;
    this.lookupWorker = lookupUtility.lookupWorker;
  }

  addEntry({term, context, gloss, comment, origin}) {
    return this.lookupWorker.addGlossaryEntry({term, context, gloss, comment, origin});
  }

  getEntry(term) {
    return this.lookupWorker.getGlossaryEntries({term: term, origin: 'user'});
  }

  getEntries(terms) {
    return this.lookupWorker.getGlossaryEntries({terms: terms});
  }

  getAllUserEntries() {
    return this.lookupWorker.getAllGlossaryEntries({origin: 'user'});
  }

  normalizeTerm(term) {
    return this.lookupUtility.sanitizeTerm(term);
  }

  createInputBar(term) {
    term = this.normalizeTerm(term);
    var form = $(`<form disabled class="add-glossary-entry">
    <input name="term" title="term" value="${term}" required>
    <input name="gloss" title="gloss" placeholder="gloss" value="">
    <input name="context" title="context" placeholder="context" value="">
    <input name="comment" title="comment" placeholder="comment">
    <input name="origin" type="hidden" value="user">
    <button>+</button>
    </form>`);

    this.getEntry(term).then( results => {
      console.log({form, results});
      if (results.length > 0) {
        for (result of results) {
          //console.log({result});
          if (result.origin == 'user') {
            for (let name of Object.keys(result)) {
              let e = form.find(`[name=${name}]`);
              let value = result[name];
              if (!value) {
                e.attr('placeholder', null);
              } else {
                e.val(value);
              }

            }
          }
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
      this.addEntry(items).then( () => {
        form.find('button').text('✓');
      });
    });
    return form
  }
}

export class MarkupGenerator {
  constructor({alphaRex, wordRex, splitRex, selectorClass}={}) {
    this.alphaRex = alphaRex || /([aiueokgcjtdnpbmyrlvshāīūṭḍṅṇṃñḷ])/i;
    this.wordRex = wordRex || /([aiueokgcjtdnpbmyrlvshāīūṭḍṅṇṃñḷ’­”]+)/ig;
    this.splitRex = splitRex || /(&[a-z]+;|<\??[a-z]+[^>]*>|[^  \n,.– —:;?!"'“‘\/\-]+)/i;
    this.selectorClass = selectorClass;
  }

  getMarkupOpen() {
    return `<span class="${this.selectorClass}">`;
  }
  getMarkupClose() {
    return `</span>`
  }

  shouldExclude(element) {
    element = $(element);
    if (!element.is(':lang(pi)')) return true;
    if (element.is('a')) {
      if (element.parents('h1,h2,h3,h4,h5').length == 0) {
        return false
      }
      return true
    }
    return false
  }

  wrapWords(node) {
    if (node.jquery) {
      node = node[0];
    }
    let wrappedTextNodes = this.wrapTextNodes(node);
    for (wrappedTextNode of wrappedTextNodes) {
      this.breakTextNodeIntoWords(wrappedTextNode);
    }
  }

  wrapTextNodes(node) {
    let result = [];
    let stack = [node];

    while (stack.length) {
      let currentNode = stack.pop();
      if (currentNode.nodeType == document.ELEMENT_NODE) {
        if (!this.shouldExclude(currentNode)) {
          stack.push(...currentNode.childNodes);
        }
      } else if (currentNode.nodeType == document.TEXT_NODE) {
        let parent = currentNode.parentNode;
        let span = document.createElement('span');
        parent.replaceChild(span, currentNode);
        span.appendChild(currentNode);
        result.push(span);
      }
    }
    return result
  }

  breakTextNodeIntoWords(wrappedTextNode) {
    let markupOpen = this.getMarkupOpen();
    let markupClose = this.getMarkupClose();

    var text = wrappedTextNode.firstChild.nodeValue;
    if (text.search(self.alphaRex) == -1) {
      return
    }

    var newHtml = text.replace(this.wordRex, (m, word) => {
      if (word.search(/[0-9]/) != -1) return m;
      return markupOpen + word + markupClose;
    })

    wrappedTextNode.innerHTML = newHtml;

  }

  startMarkupOnDemand({targetSelector, exclusions}) {
    ////console.log({targetSelector})
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
  constructor({lookupUtility}){
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
