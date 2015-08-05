import * as dom from './../../dom.js';
import * as helpers from './../../helpers.js';
import {EventManager} from './../../eventManager.js';
import {registerPlugin, getPlugin} from './../../plugins.js';
import BasePlugin from './../_base.js';

/**
 * @class CollapsibleColumns
 * @plugin CollapsibleColumns
 * @dependencies NestedHeaders HiddenColumns
 *
 * @description
 * Allows collapsing of headers with a defined colspan
 */
class CollapsibleColumns extends BasePlugin {

  constructor(hotInstance) {
    super(hotInstance);

    if (!this.hot.getSettings().collapsibleColumns) {
      return;
    }

    this.settings = this.hot.getSettings().collapsibleColumns;

    this.hiddenColumnsPlugin = null;
    this.collapsedSections = {};

    this.bindHooks();
  }

  /**
   * Checks if all the needed dependencies are enabled
   *
   * @returns {Boolean}
   */
  checkDependencies() {
    let settings = this.hot.getSettings();

    if (!settings.nestedHeaders) {
      console.warn('You need to configure the Nested Headers plugin in order to use collapsible headers.');

      return false;
    }

    if (!settings.hiddenColumns) {
      console.warn('You need to configure the Nested Headers plugin in order to use collapsible headers.');

      return false;
    }
  }

  /**
   * Bind the HOT hooks
   */
  bindHooks() {
    this.hot.addHook('afterInit', () => this.onAfterInit());
    this.hot.addHook('afterGetColHeader', (col, TH) => this.onAfterGetColHeader(col, TH));
    this.hot.addHook('beforeOnCellMouseDown', (event, coords, TD) => this.onBeforeOnCellMouseDown(event, coords, TD));
  }

  onAfterInit() {
    this.checkDependencies();

    this.hiddenColumnsPlugin = this.hot.getPlugin('hiddenColumns');
    this.columnHeaderLevelCount = this.hot.view.wt.getSetting('columnHeaders').length;
    this.nestedHeadersPlugin = this.hot.getPlugin('nestedHeaders');
  }

  /**
   * Generates the indicator element
   *
   * @param {Number} col
   * @param {HTMLElement} TH
   * @returns {HTMLElement}
   */
  generateIndicator(col, TH) {
    let divEl = document.createElement('DIV');
    let row = (-1) * TH.parentNode.parentNode.childNodes.length + Array.prototype.indexOf.call(TH.parentNode.parentNode.childNodes, TH.parentNode);

    dom.addClass(divEl, 'collapsibleIndicator');

    if (this.collapsedSections[row] && this.collapsedSections[row][col] === true) {
      dom.addClass(divEl, 'collapsed');
      dom.fastInnerText(divEl, '+');
    } else {
      dom.addClass(divEl, 'expanded');
      dom.fastInnerText(divEl, '-');
    }

    return divEl;
  }

  /**
   * Add the indicator to the headers
   *
   * @param {Number} col
   * @param {HTMLElement} TH
   */
  onAfterGetColHeader(col, TH) {
    if (TH.hasAttribute('colspan') && TH.getAttribute('colspan') > 1) {
      TH.querySelector('div:first-child').appendChild(this.generateIndicator(col, TH));
    }
  }

  /**
   * Indicator mouse event callback
   *
   * @param {Object} event
   * @param {Object} coords
   * @param {HTMLElement} TD
   */
  onBeforeOnCellMouseDown(event, coords, TD) {
    if (dom.hasClass(event.target, 'collapsibleIndicator')) {

      if (dom.hasClass(event.target, 'expanded')) {

        // mark section as collapsed
        if (!this.collapsedSections[coords.row]) {
          this.collapsedSections[coords.row] = [];
        }

        this.markSectionAs('collapsed', coords.row, coords.col, TD, true);

        this.toggleCollapsedSection(coords, TD, 'collapse');

      } else if (dom.hasClass(event.target, 'collapsed')) {

        this.markSectionAs('expanded', coords.row, coords.col, TD, true);

        this.toggleCollapsedSection(coords, TD, 'expand');
      }

      event.stopImmediatePropagation();
    }
  }

  /**
   * Mark (internally) a section as 'collapsed' or 'expanded' (optionally, also mark the 'child' headers)
   *
   * @param {String} state
   * @param {Number} row
   * @param {Number} col
   * @param {HTMLElement} TH
   * @param {Boolean} recursive
   */
  markSectionAs(state, row, col, TH, recursive) {
    if (!this.collapsedSections[row]) {
      this.collapsedSections[row] = [];
    }

    switch (state) {
      case 'collapsed':
        this.collapsedSections[row][col] = true;

        break;
      case 'expanded':
        this.collapsedSections[row][col] = void 0;

        break;
    }

    if (recursive) {
      let nestedHeadersColspans = this.hot.getSettings().nestedHeaders.colspan;
      let reversedIndex = this.columnHeaderLevelCount + row;
      let childHeaders = this.getChildHeaders(row, col, nestedHeadersColspans[reversedIndex][col]);

      for(let i = 1, childrenLength = childHeaders.length; i < childrenLength; i++) {
        let nestedIndex = this.nestedHeadersPlugin.realColumnIndexToNestedIndex(row + 1, childHeaders[i]);

          if (nestedHeadersColspans[reversedIndex + 1] && nestedHeadersColspans[reversedIndex + 1][nestedIndex] > 1) {
            let nextTH = this.hot.view.wt.wtTable.THEAD.childNodes[reversedIndex + 1].childNodes[nestedIndex];

            this.markSectionAs(state, row + 1, nestedIndex, nextTH, true);
          }
      }
    }
  }

  /**
   * Collapse/Expand a section
   *
   * @param {Object} coords
   * @param {HTMLElement} TD
   * @param {String} action
   */
  toggleCollapsedSection(coords, TD, action) {
    let currentlyHiddenColumns = this.hiddenColumnsPlugin.settings;
    let TR = TD.parentNode;
    let THEAD = TR.parentNode;
    let headerLevel = THEAD.childNodes.length - Array.prototype.indexOf.call(THEAD.childNodes, TR) - 1;
    let colspanOffset = this.hot.getColspanOffset(coords.col, headerLevel);
    let headerColspan = parseInt(TD.getAttribute('colspan'), 10);

    if (currentlyHiddenColumns === true || currentlyHiddenColumns.columns === void 0) {
      currentlyHiddenColumns = [];
    } else {
      currentlyHiddenColumns = currentlyHiddenColumns.columns;
    }

    let columnArray = helpers.deepClone(currentlyHiddenColumns);

    switch (action) {
      case 'collapse':

        let childHeaders = this.getChildHeaders(coords.row, coords.col, headerColspan);
        let firstElementColspan = 1;

        if(childHeaders[1]) {
          firstElementColspan = childHeaders[1] - childHeaders[0];
        }

        for (let i = firstElementColspan, colspan = headerColspan; i < colspan; i++) {
          let colToHide = coords.col + colspanOffset + i;

          if (currentlyHiddenColumns.indexOf(colToHide) === -1) {
            columnArray.push(colToHide);
          }
        }

        break;
      case 'expand':

        for (let i = 1, colspan = headerColspan; i < colspan; i++) {
          let colToHide = coords.col + colspanOffset + i;
          let foundIndex = columnArray.indexOf(colToHide);

          if (foundIndex > -1) {
            columnArray.splice(foundIndex, 1);
          }
        }

        break;
    }


    let previousHiddenColumnsSetting = this.hot.getSettings().hiddenColumns;
    if(previousHiddenColumnsSetting === true) {
      previousHiddenColumnsSetting = {};
    }
    previousHiddenColumnsSetting.columns = columnArray;
    this.hot.updateSettings({
      hiddenColumns: previousHiddenColumnsSetting,
      manualColumnResize: this.hot.manualColumnWidths,
      manualColumnMove: this.hot.manualColumnPositions
    });
  }

  /**
   * Returns (physical) indexes of headers below the header with provided coordinates
   *
   * @param {Number} row
   * @param {Number} col
   * @param {Number} colspan
   * @returns {Array}
   */
  getChildHeaders(row, col, colspan) {
    let nestedPlugin = this.nestedHeadersPlugin;
    let colspanSettings = nestedPlugin.settings.colspan;
    let childColspanLevel = colspanSettings[this.columnHeaderLevelCount + row + 1];

    let realColumnIndex = nestedPlugin.nestedColumnIndexToRealIndex(row, col);

    let childNestedColumnIndex = nestedPlugin.realColumnIndexToNestedIndex(row + 1, realColumnIndex);
    let childHeaderRange = [];

    for (let i = childNestedColumnIndex; i < childNestedColumnIndex + colspan; i++) {

      if (childColspanLevel && childColspanLevel[i] > 1) {
        colspan -= childColspanLevel[i];
      }

      let realChildIndex = nestedPlugin.nestedColumnIndexToRealIndex(row + 1, i);

      if (childHeaderRange.indexOf(realChildIndex) === -1) {
        childHeaderRange.push(realChildIndex);
      }
    }

    return childHeaderRange;
  }
}

export {CollapsibleColumns};

registerPlugin('collapsibleColumns', CollapsibleColumns);