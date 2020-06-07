/*
 *   Copyright (c) 2020 
 *   All rights reserved.
 */
odoo.define("pos_datetimes_control.POSCONTROL", function (require) {
    "use strict";
    var rpc = require('web.rpc');
    var session = require('web.session');

    // check every minute
    var mainIntervalTime = 100;
        var mainInterval = setInterval(function()  
        {
            is_current_time_between();
        },mainIntervalTime);
    
        function is_current_time_between()
        {
            var params = {
                            model: 'res.company',
                            method: 'is_current_datetime_between',
                            args: ['none'],
                         }
            rpc.query(params, {async: false}).then(function(is_between)
            {
                if(String(is_between)==String('false'))
                {
                    var params = {
                        model: 'pos.session',
                        method: 'get_user_pos_session',
                        args: ['none'],
                     }
                    rpc.query(params, {async: false}).then(function(pos_session)
                        {
                            
                            swal({
                                    title: "Control de Horario",
                                    text: "La fecha y hora actual no esta dentro del horario establecido para permitir ventas a través del punto de venta.",
                                    type: "warning"
                                });
                                
                                setTimeout(function(){ window.location = 'http://' + window.location.hostname +(location.port ? ':'+location.port: '') + '/web#id='+String(pos_session[0]['id'])+'&model=pos.session'; }, 3000);
                            
                            clearInterval(mainInterval)
                            
                        });
                    
                }
            });
        }
});