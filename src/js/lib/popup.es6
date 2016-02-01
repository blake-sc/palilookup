var isPopupHover = false,
popups = new Set();
popupToElement = new Map();

export class Popup {
  // parent can be an element or Popup instance
  // location can be an offset or element
  constructor({location, parent, content, protect, popupClassName}) {

    this.location = location || $('<span style="position: absolute"/>').prependTo(parent.element || parent).data('deleteMe', true);
    this.parent = parent;
    this.isAbsolute = false;
    this.markupTarget = $('main, body').first();
    this.entered = false;
    this.isPopupHover = false;
    this.protect = protect;
    this.parentPopup = null;
    this.childrenPopups = [];
    this.popupClassName = popupClassName || Popup.getDefaultClassName();
    this.mustDie = false;

    popups.add(this);
    if (parent.nodeType == 1) {
      popupToElement.set(this, parent);
    }

    $(this.parent).addClass(`.${this.popupClassName}-parent`);
    if (parent && (parent instanceof Popup)) {
      parent.childrenPopups.push(this);
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

    setTimeout( () => {
      this.removeIfNeeded();
      this.element.mouseleave( () => this.removeIfNeeded());
    }, 1500);

    if ($(this.location).data('deleteMe')) {
      this.location.remove();
      this.location = null;
    }

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
    $(this.parent).removeClass(`.${this.popupClassName}-parent`);
    this.element.remove();
    let element = popupToElement[this];
    popupToElement.delete(this);
    for (child of this.childrenPopups) {
      child.removeNow();
    }
  }

  isHover() {
    if ($(this.element).is(':hover')) {
      return true
    }
    if (!(this.parent instanceof Popup)) {
      if ($(this.parent).is(':hover')) {
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
    var location = this.location,
        element = this.element;
    element.removeAttr('style');
    if ('left' in location || 'top' in location) {
      offset = location
      offset.left = offset.left || 0
      offset.top = offset.top || 0
      this.location = document.body
      this.isAbsolute = true
    } else {
      location = $(location)
      offset = location.offset()
    }
    this.offset = offset;

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
    if (!this.isAbsolute) {
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
    element.offset(offset)
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
    for (value of popupToElement.values()) {
      if (value == element) return true;
    }
    return false;
  }

  static getDefaultClassName() {
    return 'text-popup'
  }
}
