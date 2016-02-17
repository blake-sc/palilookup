import {getEmPixelSize} from './em-calculator.es6';

var isPopupHover = false,
popups = new Set();
popupToElement = new Map();

export class Popup {
  // parent can be an element or Popup instance
  // location can be an offset or element
  constructor({absoluteLocation, fixedLocation, parent, content, protect, popupClassName}) {
    this.absoluteLocation = absoluteLocation;
    this.fixedLocation = fixedLocation;
    this.isAbsolute = false;
    this.markupTarget = $('main, body').first();
    this.entered = false;
    this.isPopupHover = false;
    this.protect = protect;
    this.parentPopup = null;
    this.childrenPopups = [];
    this.popupClassName = popupClassName || Popup.getDefaultClassName();
    this.mustDie = false;

    if (parent) {
      if (parent instanceof Popup) {
        this.parentPopup = parent;
        parent.childrenPopups.push(this);
      } else if (parent.nodeType == 1) {
        this.parentElement = parent;
      }
    }

    popups.add(this);
    if (this.parentElement) {
      popupToElement.set(this, this.parentElement);
      $(this.parentElement).addClass(`.${this.popupClassName}-parent`);
    }

    this.element = $('<div/>').addClass(this.popupClassName).append(content);

    this.align();

    this.element.mouseenter(event => {
      this.isPopupHover = true
    });

    this.element.mouseenter(event => {this.entered = true;
                                      this.isPopupHover = true;
                                      if (!this.mustDie) {
                                        this.element.stop().fadeIn(0)
                                      }
                                    });
    this.element.mouseleave(event => {this.isPopupHover = false});

    setTimeout( () => {
      this.removeIfNeeded();
      this.element.mouseleave( () => this.removeIfNeeded());
    }, 1500);

    return this;
  }

  remove(fadeTime) {
    if (fadeTime === undefined) {
      fadeTime = 50;
    }
    this.element.fadeOut(fadeTime, () => this.removeNow());
    for (child of this.childrenPopups) {
      child.remove(fadeTime);
    }
  }

  removeNow() {
    popups.delete(this);
    $(this.parentElement).removeClass(`.${this.popupClassName}-parent`);
    this.element.remove();
    let element = popupToElement[this];
    popupToElement.delete(this);
    for (child of this.childrenPopups) {
      child.removeNow();
    }
  }

  isHover() {
    if (this.isPopupHover) {
      return true
    }
    if (this.parentElement) {
      if ($(this.parentElement).is(':hover')) {
        return true;
      }
    }
    for (childPopup of this.childrenPopups) {
      if (childPopup.isHover()) {
        return true;
      }
    }
  }

  removeIfNeeded() {
    if (this.isHover() || !this.entered) {
      return
    }
    if (this.protect) return
    var node = this.element,
        visited = [];

    while (node) {
      if ($(node).is(':hover')) {
        setTimeout( ()=> this.removeIfNeeded(), 300);
        return
      }
      node = $(node).data('parent');
      if (visited.indexOf(node) != -1) break
      visited.push(node);
    }
    this.remove();
    self.isPopupHover = false
  }

  align() {
    let offset = null,
        element = this.element,
        location = $(document.body);

    element.removeAttr('style');
    if (this.fixedLocation) {
      offset = this.fixedLocation;
      location = document.body;
      isFixed = true;
      this.element.css({position: 'fixed'})
    } else if (this.absoluteLocation) {
      offset = this.absoluteLocation;
      offset.left = offset.left || 0;
      offset.top = offset.top || 0;
      location = document.body;
      isAbsolute = true;
    } else if (this.parentElement) {
      $(this.parentElement).css({display: 'inline-block'});
      let popupAnchor = $('<span style="display: inline-block; position: relative; margin-top: -1em"></span>').prependTo(this.parentElement);
      offset = popupAnchor.offset();
      let em = getEmPixelSize(popupAnchor[0]);
      offset.top -= 1.0 * em;
      popupAnchor.remove();
      $(this.parentElement).css({display: ''});
    }

    //We need to measure the doc width now.
    var docWidth = $(document).width()
    // We need to create a dupe to measure it.
    var dupe = this.element.clone()

    this.markupTarget.append(dupe)
    var popupWidth = dupe.innerWidth(),
        popupHeight = dupe.innerHeight();
    dupe.remove()
    //The reason for the duplicity is because if you realize the
    //actual popup and measure that, then any transition effects
    //cause it to zip from it's original position...
    if (!this.absoluteLocation && !this.fixedLocation) {
      offset.top += location.innerHeight() - popupHeight - location.outerHeight();
      offset.left -= popupWidth / 2;
    }

    if (offset.left < 1) {
      offset.left = 1;
      element.innerWidth(popupWidth + 5);
    }

    if (offset.left + popupWidth + 5 > docWidth)
    {
      offset.left = docWidth - (popupWidth + 5);
    }

    if (this.fixedLocation) {
      element.css({top: offset.top, left: offset.left});
    }
    else {
      element.offset(offset)
    }
    this.markupTarget.append(element);
    if (offset.top < 0) {
      element.height(element.height() + offset.top);
      offset.top = 0;
      element.css({'overflow-x': 'initial',
      'overflow-y': 'scroll'})
    }
    element.offset(offset)
  }


  static removeAll({removeProtected, exclude, time}={}) {
    for (var popup of popups) {
      if (popup != exclude && removeProtected || !popup.protect) {
        popup.mustDie = true;
        if (time == 0) {
          popup.removeNow();
        } else {
          popup.remove(time);
        }
      }
    }
  }

  static removeAllNow({removeProtected}={}) {
    let time = 0;
    Popup.removeAll({removeProtected, time});
  }

  static isAnyHover() {
    return ($(`.${this.popupClassName()}:hover`).length > 0);
  }

  static hasPopup(element) {
    for (element of popupToElement.values()) {
      if (element == element) return true;
    }
    return false;
  }

  static getPopup(element) {
    for ([popup, element] of popupToElement.entries()) {
      if (element == element) return popup;
    }
    return null;
  }

  static getDefaultClassName() {
    return 'text-popup'
  }
}
