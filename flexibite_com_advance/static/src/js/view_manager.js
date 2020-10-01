odoo.define('flexibite_com_advance.view_manager', function (require) {
"use strict";

    let ActionManager = require('web.ActionManager');
    let rpc = require('web.rpc');

    ActionManager.include({
        _onExecuteAction: function (ev) {
            let can_use_qz = false;

            rpc.query({
                    model: 'ir.config_parameter',
                    method: 'search_read',
                    domain: [['key', '=', 'print.use_zebra_printer']],
                }, undefined).done(function(param) {
                    can_use_qz = param.value === 'True';
                });

            let self = this;
            let actionData = ev.data.action_data;
            let env = ev.data.env;
            if(env.model === 'wizard.pos.x.report' && actionData.id === 'main_print_button'){
                let $session_ids = $("div[name='session_ids']").find('.badge')
                let session_ids = [];
                $session_ids.map(function(){
                    let session_id = $(this).attr('data-id');
                    if(Number(session_id)){
                        session_ids.push(Number(session_id));
                    }
                });
                return self.do_action('flexibite_com_advance.pos_x_report',{additional_context:{
                	active_ids:session_ids,
                }}).fail(function(){
                	alert("Connection lost");
                });
            } else{
                return self._super(ev);
            }
        },
    });

});