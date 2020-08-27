odoo.define('pos_category_utils.models', function (require) {
    "use strict";

    var models = require('point_of_sale.models');
    _.each(models.PosModel.prototype.models, function (model) {
       if(model.hasOwnProperty('model') && model.model == 'pos.category'){
           if(model.hasOwnProperty('context')){
               model.context['pos_category_utils_search'] = true;
           }else{
               model['context'] = {pos_category_utils_search: true};
           }
       }
    });
});