import LookupUtility from './lookup-utility.es6';

async function smartInit({workerScript}){
  let mouseoverTarget = $('#text, main, body').first();
  let targetSelector = 'p, h1, h2, h3, h4, h5';
  console.time('init');
  let lookupUtility = new LookupUtility({selectorClass: 'lookup',
                                     fromLang: 'pi',
                                     toLang: 'en',
                                     lookupWorkerSrc: workerScript});
  console.log({lookupUtility});

  lookupUtility.lookupWorker.setMessageHandler(function(e){if (e.data.progress) console.log(e.data.progress)});
  lookupUtility.markupGenerator.startMarkupOnDemand({targetSelector});
  lookupUtility.ready.then( () => console.timeEnd('init'));

  loadingPopup = lookupUtility.makeLoadingPopup();
  loadingPopup.popup.element.hide();
  setTimeout( ()=> {
    if (lookupUtility.enabled) {

    } else {
      loadingPopup.popup.element.show();
    }
  }, 250);
  window.lookupUtility = lookupUtility;
  return {lookupUtility}
}

window.smartInit = smartInit
