odoo.define('customer_portal.portal', function (require) {
    "use strict";

    require('web.dom_ready');

    function customer_portal_notify(message, type) {
        var types = ['success', 'warning', 'info', 'danger'];
        if ($.inArray(type.toLowerCase(), types) != -1) {
            $('.customer-portal-container .cp_floating_notification').remove();
            var newMessage = '';
            switch (type) {
                case 'success' :
                    newMessage = '<i class="fa fa-check"></i> ' + message;
                    break;
                case 'warning' :
                    newMessage = '<i class="fa fa-exclamation-triangle"></i> ' + message;
                    break;
                case 'info' :
                    newMessage = '<i class="fa fa-info"></i> ' + message;
                    break;
                case 'danger' :
                    newMessage = '<i class="fa fa-ban"></i> ' + message;
                    break;
            }

            $('.customer-portal-container').append('<div class="cp_floating_notification">' +
                '<div class="alert alert-' + type + ' fade">' +
                newMessage +
                '</div>' +
                '</div>');
            $(".customer-portal-container .cp_floating_notification .alert").removeClass("show").show();
            $(".customer-portal-container .cp_floating_notification .alert").delay(200).addClass("show").fadeOut(5000);
        }
    }

    $('#cp_modal_change_pin').on('shown.bs.modal', function () {
        var $form = $('#cp_form_change_pin');
        $form.find('#cp_new_pin').val('');
        $form.find('#cp_new_pin_repeat').val('');
        var old_pin = $form.find('#cp_old_pin').val('');
        old_pin.focus();
    });

    $('#cp_change_pin_button').on('click', function (e) {
        var $form = $('#cp_form_change_pin');
        var new_pin = $form.find('#cp_new_pin').val();
        var new_pin_repeat = $form.find('#cp_new_pin_repeat').val();
        var old_pin = $form.find('#cp_old_pin').val();
        var csrf_token = $form.find('input[name="csrf_token"]').val();
        var data = {
            jsonrpc: "2.0",
            params: {'new_pin': new_pin, 'old_pin': old_pin, 'csrf_token': csrf_token},
            id: Math.floor(Math.random() * 1000 * 1000 * 1000)
        };
        if (new_pin && new_pin == new_pin_repeat) {
            $.ajax('/customer/portal/change/pin', {
                dataType: 'json',
                type: 'POST',
                data: JSON.stringify(data),
                contentType: 'application/json'
            }).then(function (result) {
                if (result.hasOwnProperty('result') && result.result) {
                    customer_portal_notify('El PIN se ha actualizado correctamente.', 'success');
                    $('#cp_modal_change_pin').modal('toggle')
                } else {
                    customer_portal_notify('El PIN anterior es incorrecto.', 'danger');
                }
            });
        } else {
            customer_portal_notify('Por favor repita correctamente el PIN.', 'danger');
        }
    });

    $('#cp_account_status_email').on('click', function (e) {
        $(e.currentTarget).attr('disabled', true);
        var data = {
            jsonrpc: "2.0",
            params: {},
            id: Math.floor(Math.random() * 1000 * 1000 * 1000)
        };
        $.ajax('/customer/portal/account/status/send', {
            dataType: 'json',
            type: 'POST',
            data: JSON.stringify(data),
            contentType: 'application/json'
        }).then(function (result) {
            if (result.hasOwnProperty('result') && result.result) {
                customer_portal_notify('El informe se ha enviado correctamente.', 'success');
            } else {
                customer_portal_notify('El informe no se ha podido enviar. Por favor contacte con el administrador..', 'danger');
            }
            $(e.currentTarget).removeAttr('disabled');
        });
    });
});