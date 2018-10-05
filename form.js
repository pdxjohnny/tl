import { Resource } from './core.js';
import { View } from './ui.js';

class FormInput extends View {
  constructor(app, element, resource) {
    super(app, element, resource);
    this.valid = true;
    this.validators = [];
  }
  inst() {
    var div = super.inst();
    div.className = 'field';
    this.label = document.createElement('label');
    this.label.className = 'label';
    div.appendChild(this.label);
    this.control = document.createElement('label');
    this.control.className = 'control';
    div.appendChild(this.control);
    return this.control;
  }
  reload(value) {
    super.reload(value);
    this.label.innerText = value.label;
  }
  validation(callback) {
    this.validators.push(callback);
  }
  validate(event) {
    if (this.validators.length === 0) {
      this.valid = true;
      return Promise.resolve(this.valid);
    }
    return Promise.all(this.validators.map(function(validation) {
      return validation(event.target.value);
    }.bind(this)))
    .then(function(checks) {
      for (var valid of checks) {
        if (!valid) {
          return false;
        }
      }
      return true;
    }.bind(this))
    .then(function(valid) {
      this.valid = valid;
      return this.valid;
    }.bind(this));
  }
}

class TextInput extends FormInput {
  inst() {
    var div = super.inst();
    this.input = document.createElement('input');
    this.input.className = 'input';
    this.input.onchange = this.validate.bind(this);
    div.appendChild(this.input);
    return div;
  }
  reload(value) {
    super.reload(value);
    for (var prop in value) {
      if (value.hasOwnProperty(prop)) {
        this.input.setAttribute(prop, value[prop]);
      }
    }
  }
}

class SelectInput extends FormInput {
  inst() {
    var div = super.inst();
    this.select_wrapper = document.createElement('div');
    this.select_wrapper.className = 'select';
    div.appendChild(this.select_wrapper);
    this.select = document.createElement('select');
    this.select_wrapper.appendChild(this.select);
    return div;
  }
  reload(value) {
    super.reload(value);
    var options = value.options;
    if (typeof options === 'undefined' ||
        !Array.isArray(options) ||
        options.length === 0) {
      throw Error('SelectInput must have array property \'options\'');
    }
    this.select.innerHTML = '';
    for (var prop in options) {
      if (options.hasOwnProperty(prop)) {
        var option = document.createElement('option');
        option.innerText = options[prop];
        this.select.appendChild(option);
      }
    }
  }
}

const createFormInput = function(app, resource, special) {
  switch (resource.value.field) {
    case 'text':
      return new TextInput(app, undefined, resource);
    case 'select':
      return new SelectInput(app, undefined, resource);
    default:
      if (typeof special === 'function') {
        return special(app, resource);
      }
      break;
  }
  return null;
}

class Form extends View {
  constructor(app, element, resource) {
    super(app, element, resource);
    this.inputItem = {};
  }
  reload(value) {
    super.reload(value);
    var items = value.items;
    if (typeof items === 'undefined' ||
        !Array.isArray(items) ||
        items.length === 0) {
      throw Error('value must have array property \'items\'');
    }
    for (var item of items) {
      var input = this.inputItem[item.name];
      if (typeof input === 'undefined') {
        var resource = new _core_js__WEBPACK_IMPORTED_MODULE_0__["Resource"]([], item.name, '', {}, item);
        input = this.inputItem[item.name] = createFormInput(this.app, resource);
        if (input !== null) {
          this.element.appendChild(input.element);
        }
        if (typeof this['validate_' + item.name] === 'function') {
          input.valid = false;
          input.validation(this['validate_' + item.name].bind(this));
        }
      }
      if (input !== null) {
        input.resource.update(item);
      }
    }
  }
}

export {
  Form,
  FormInput,
  TextForm,
  SelectInput,
};
