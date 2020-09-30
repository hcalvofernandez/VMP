odoo.define('label_zebra_printer.qweb_action_manager', function(require) {
    'use strict';

    var ajax = require('web.ajax');
    var ActionManager = require('web.ActionManager');
    var core = require('web.core');
    var crash_manager = require('web.crash_manager');
    var framework = require('web.framework');
    var session = require('web.session');
    var Dialog = require('web.Dialog');
    var QWeb = core.qweb;
    var rpc = require('web.rpc');

    var _t = core._t;
    var _lt = core._lt;

    var controller_url = null;
    var wkhtmltopdf_state;
    var action_model = null;
    var company_id = session.company_id;
    var print_copies = 1;
    var printer_type = 'zpl'

    var wkhtmltopdf_state;

    // var FormController = require('web.FormController');
    // FormController.include({
    //     _barcodeSelectedCandidate: function (candidate, record, barcode, activeBarcode) {
    //         var self = this
    //         console.log(record)
    //         if (record.data['picking_type_code'] === 'incoming' && record.data['print_onreceive_product'] === true)
    //             {
    //                 action_model = 'product.template';
    //                 controller_url = '/report/pdf/product.report_product_template_label/' + candidate.data.product_id.data.id;
    //                 startConnection();
    //             }
    //         return this._super.apply(this, arguments);
    //     },
    // });


// Messages that will be shown to the user (if needed).
var WKHTMLTOPDF_MESSAGES = {
    'install': _lt('Unable to find Wkhtmltopdf on this \nsystem. The report will be shown in html.<br><br><a href="http://wkhtmltopdf.org/" target="_blank">\nwkhtmltopdf.org</a>'),
    'workers': _lt('You need to start OpenERP with at least two \nworkers to print a pdf version of the reports.'),
    'upgrade': _lt('You should upgrade your version of\nWkhtmltopdf to at least 0.12.0 in order to get a correct display of headers and footers as well as\nsupport for table-breaking between pages.<br><br><a href="http://wkhtmltopdf.org/" \ntarget="_blank">wkhtmltopdf.org</a>'),
    'broken': _lt('Your installation of Wkhtmltopdf seems to be broken. The report will be shown in html.<br><br><a href="http://wkhtmltopdf.org/" target="_blank">wkhtmltopdf.org</a>')
};

/**
 * This helper will generate an object containing the report's url (as value)
 * for every qweb-type we support (as key). It's convenient because we may want
 * to use another report's type at some point (for example, when `qweb-pdf` is
 * not available).
 */

var _makeReportUrls = function (action) {
    var reportUrls = {
        html: '/report/html/' + action.report_name,
        pdf: '/report/pdf/' + action.report_name,
        text: '/report/text/' + action.report_name,
    };
    // We may have to build a query string with `action.data`. It's the place
    // were report's using a wizard to customize the output traditionally put
    // their options.
    if (_.isUndefined(action.data) || _.isNull(action.data) ||
        (_.isObject(action.data) && _.isEmpty(action.data))) {
        if (action.context.active_ids) {
            var activeIDsPath = '/' + action.context.active_ids.join(',');
            reportUrls = _.mapObject(reportUrls, function (value) {
                return value += activeIDsPath;
            });
        }
    } else {
        var serializedOptionsPath = '?options=' + encodeURIComponent(JSON.stringify(action.data));
        serializedOptionsPath += '&context=' + encodeURIComponent(JSON.stringify(action.context));
        reportUrls = _.mapObject(reportUrls, function (value) {
            return value += serializedOptionsPath;
        });
    }
    return reportUrls;
};

ActionManager.include({
    _executeReportAction: function (action, options) {
        var self = this;
        company_id = session.company_id
        action = _.clone(action);
        var report_urls = _makeReportUrls(action);
        var txt_t;
        var person = null;
        var is_zebra_print = false;
        $("#myModalpopup").remove();
        var model_popup = 
            '<div class="modal fade" id="myModalpopup" role="dialog" style="display: none;" aria-hidden="true">'+
            '<div class="modal-dialog modal-sm">'+
                '<div class="modal-content">'+
                    '<div class="modal-header">'+
                      '<h4 class="modal-title">Número de copias</h4>'+
                      '<button type="button" class="close" data-dismiss="modal">&times;</button>'+
                    '</div>'+
                    '<div class="modal-body">'+
                      '<input type="number" name="copies_count" value="1">'+
                    '</div>'+
                    '<div class="modal-footer">'+
                      '<button type="button" class="btn btn-default" data-dismiss="modal">Close</button>'+
                      '<button type="button" class="btn btn-default pull-right copies_text_in" data-dismiss="modal">OK</button>'+
                    '</div>'+
                  '</div>'+
                '</div>'+
              '</div>'+
            '</div>'
            $('body').append(model_popup);
        if (action.xml_id !== undefined){
            if (action.xml_id === 'product_label.report_product_product_label_tmpl' || action.xml_id === 'product_label.report_product_label_tmpl' || action.xml_id === 'product_label.report_product_template_label_tmpl' || action.xml_id === 'product.report_product_template_label' || action.xml_id === 'product.report_product_label' || action.xml_id === 'label_zebra_printer.report_shipment_label' || action.xml_id === 'stock.action_report_location_barcode') {
                is_zebra_print = true;
            } 
        }
        if (is_zebra_print == true) {
            $("#myModalpopup").modal();
            $('.copies_text_in').click(function() {
                    var input_val = $("input[name='copies_count']").val();
                    person = input_val;
                    if (person == null || person == "") {
                        txt_t = "Cancelled copies";
                        return false;
                    }
                    else {
                            if(parseInt(person)){
                                print_copies = person;
                                controller_url = report_urls.pdf;
                                action_model = action.model;
                                return startConnection();
                            }
                            else{
                                return false;
                            }
                        }
                });
            return $.Deferred().reject();
        }
        else{
            if (action.report_type === 'qweb-html') {
                return this._executeReportClientAction(action, options);
            } else if (action.report_type === 'qweb-pdf') {
                // check the state of wkhtmltopdf before proceeding
                return this.call('report', 'checkWkhtmltopdf').then(function (state) {
                    // display a notification according to wkhtmltopdf's state
                    if (state in WKHTMLTOPDF_MESSAGES) {
                        self.do_notify(_t('Report'), WKHTMLTOPDF_MESSAGES[state], true);
                    }

                    if (state === 'upgrade' || state === 'ok') {
                        // trigger the download of the PDF report
                        return self._triggerDownload(action, options, 'pdf');
                    } else {
                        // open the report in the client action if generating the PDF is not possible
                        return self._executeReportClientAction(action, options);
                    }
                });
            } else if (action.report_type === 'qweb-text') {
                return self._triggerDownload(action, options, 'text');
            } else {
                console.error("The ActionManager can't handle reports of type " +
                    action.report_type, action);
                return $.Deferred().reject();
            }
        }
    },
});

    var qzVersion = 0;


    function findVersion() {
        qz.api.getVersion().then(function(data) {
            qzVersion = data;
        });
    }

    function startConnection(config) {
        qz.security.setCertificatePromise(function(resolve, reject) {
            $.ajax("/label_zebra_printer/static/src/lib/digital-certificate.txt").then(resolve, reject);
        });
        var privateKey = "-----BEGIN RSA PRIVATE KEY-----\n" +
            "MIIEpQIBAAKCAQEAwRc05UhbsKtU/SupjO8HHrVKKwglsfJeBoUMQoHo41a440Do\n" +
            "r6dbVI/HJITAQ1swIJjwmD9QqSVesnHnc7e6zlkj1ff1fDsOomIzX2SnB2CA9eiw\n" +
            "5cfsXth6grZ6NIr7fc9NzyDpl3XcCEE+2ijbZCB0hWIVRkFBYh+RJPnoEFtb8njM\n" +
            "J9V/YgXQf969jIFjAS8QVsDBvnnSsTeoE/2AXs1tRO4bzPEF65UouVeKJfBcICK4\n" +
            "T7ZMObJEKAHc/PMLd9pLBG9Gg4/59AoeWuM92qti1i3307WFGKKGNNZ5Tt/EeX+2\n" +
            "5LPu8yilRK+F3hlpvvTNzwK7KAvoNWBCQll2rQIDAQABAoIBACyBrt2Smh/UvhhE\n" +
            "8iXcCqYXX2sfy6CCnw2dqT/DNe0A1kj7cybZyoFpSpuuRarA4A0Dc6GEJpF2Xad/\n" +
            "/bt8hACAJ3RwXRMvgaYIQJMiXiWjJtaHtg6g0GjkOQjcCrsFtgY/vE2b5nvU3MzC\n" +
            "TTx34mnn2TPNcd3puKpnYEtHlyf9oBEKOE85gyOv1fMUZeQw/kPSNEr+gWQnj/u6\n" +
            "rchlzPhHZjmMuB5At6/yWURnjbFuYwgb2djjDNY52KEcCGJvDsrrFqs5EKE40u96\n" +
            "CNNtQNAye5mT89Jl2JwPJobpsycDEqZEayc6kJX/77e/2Y3JIuY9gm+Q17opHkYg\n" +
            "7IbQP7kCgYEA8ZC48g01YaCTk2DoRIXF0hRb8MbjeVs5ej20l7GbicWuF3u4LNld\n" +
            "vQgFhC2xiIFl39HwoRGHdN/NYo5TZcGsnScsItM4gIlZCruIpaj9wWiKbDwWf2p7\n" +
            "V8+H8KrSsqaX1Jy2mieG/kgdXI4bqPCh74sEjw1g6XTboYBFsrH1s18CgYEAzKD0\n" +
            "33f42BVie/p8ta+tqXNOsr4U/2czZU8ZSievheZcMyoQLmsJcIiOO4eZ55h5MR7d\n" +
            "bL6XaIfXrpuaLANkx2wi5PEOtp5fIT4u+AJb6DQdcRfYZ3VMkG00b2hSCSUbrWho\n" +
            "9x9wQaGC1RKj+XBAUgydXQFdXZi8sOApmTpr/XMCgYEAhfJt2yof04aqzioKIRTc\n" +
            "YGURpi1irUQ8VuAoZ4UAbiDDLBpaQeQ16j+sb2K28q5twvIyr918cv42cNPiwqXm\n" +
            "BS5XdugQiJWgXicm2lUegERrnSCkiPqOcl6NTpIqSw29WxOa3VfVruJmBZB3HfJw\n" +
            "mNdJK9mLR2iY8LCj9TZgu5kCgYEApwBdmNui3UdmnuQpT2ZXBsoyWjJDlMW27mGF\n" +
            "tD17RH5ilOcpWZjFlW/9FJxwgNCxZ+NWtt89VnQ3FCutwWnrn82jFNGfPm82GD1V\n" +
            "u9bBB1sxBBF/7b+Pgvd9Kccr3IbKddWWhMjFpuqXiimyZWq1M8FT1Im+lxqGNJxd\n" +
            "ls5VP/0CgYEA5S/gZ1gPGgUE18R4cMNDstTA90QFC15yzkRpLtth9DPoKoX/r2G0\n" +
            "8eKN9tIBY+VBEf00g6stSN02ncq5LKE/tS1OO4OmM+u6G/qjPAoW2AlPMqnptyFo\n" +
            "kFEGUC6AlTfS2E5WfF38SdwsBi6c2QIFBP2GKAjo5pC9WglhnVvVPBE=\n" +
            "-----END RSA PRIVATE KEY-----\n";

        qz.security.setSignaturePromise(function(toSign) {
            return function(resolve, reject) {
                try {
                    var pk = new RSAKey();
                    pk.readPrivateKeyFromPEMString(strip(privateKey));
                    var hex = pk.signString(toSign, 'sha1');
                    console.log("DEBUG: \n\n" + stob64(hextorstr(hex)));
                    resolve(stob64(hextorstr(hex)));
                } catch (err) {
                    console.error(err);
                    reject(err);
                }
            };
        });

        function strip(key) {
            if (key.indexOf('-----') !== -1) {
                return key.split('-----')[2].replace(/\r?\n|\r/g, '');
            }
        }

        if (!qz.websocket.isActive()) {
            console.log('Waiting default');
            qz.websocket.connect(config).then(function() {
                console.log('Active success');
                findVersion();
                findPrinters();
            });
        } else {
            console.log('An active connection with QZ already exists.', 'alert-warning');
        }
    }

    function findPrinters() {
            if (action_model == 'stock.picking')
            {
                rpc.query({
                    model: 'res.company',
                    method: 'read',
                    args: [[company_id], []],
                }).done(function(company) {
                    printer_type = company[0].printer_type
                    qz.printers.find(company[0].shipping_printer).then(function(data) {
                         console.log("Found: " + data);
                         setPrinter(data);
                     }).catch(function(err) {
                     console.log("Found Printer Error:", err);
                    });
                });
            }
            else if (action_model == 'stock.location')
            {
                rpc.query({
                    model: 'res.company',
                    method: 'read',
                    args: [[company_id], []],
                }).done(function(company) {
                    printer_type = company[0].printer_type
                    qz.printers.find(company[0].location_printer).then(function(data) {
                         console.log("Found: " + data);
                         setPrinter(data);
                     }).catch(function(err) {
                     console.log("Found Printer Error:", err);
                    });
                });
            }
            else
            {
                rpc.query({
                    model: 'res.company',
                    method: 'read',
                    args: [[company_id], []],
                }).done(function(company) {
                    printer_type = company[0].printer_type
                    qz.printers.find(company[0].product_printer).then(function(data) {
                         console.log("Found: " + data);
                         setPrinter(data);
                     }).catch(function(err) {
                     console.log("Found Printer Error:", err);
                    });
                });
            }
       }

    function setPrinter(printer) {
        var cf = getUpdatedConfig();
        cf.setPrinter(printer);
        if (typeof printer === 'object' && printer.name == undefined) {
            var shown;
            if (printer.file != undefined) {
                shown = "<em>FILE:</em> " + printer.file;
            }
            if (printer.host != undefined) {
                shown = "<em>HOST:</em> " + printer.host + ":" + printer.port;
            }
        } else {
            if (printer.name != undefined) {
                printer = printer.name;
            }

            if (printer == undefined) {
                printer = 'NONE';
            }
            if (action_model == 'stock.picking') {
                print_picking_label();
            }
            else if (action_model == 'stock.location'){
                print_location_label();
            }
            else {
                print_product_label();
            }
        }
    }
    /// QZ Config ///
    var cfg = null;

    function getUpdatedConfig() {
        if (cfg == null) {
            cfg = qz.configs.create(null);
        }

        cfg.reconfigure({
            copies: print_copies,
        });
        return cfg
    }

    function print_product_label() {
        console.log("cccccccccccccccc", controller_url)
        ajax.jsonRpc("/zebra" + controller_url, 'call', {})
            .then(function(res_data) {
                console.log("result", res_data);
                var config = getUpdatedConfig();
                var width = 1.25;
                var height = 1;
                rpc.query({
                    model: 'res.company',
                    method: 'read',
                    args: [[company_id], []],
                }).done(function(company) {
                    height = company[0].product_height
                    width = company[0].product_width
                });
                config.reconfigure({
                    size: {'width': width, 'height': height},
                });

                res_data.data.forEach(function(product) {
                    if (printer_type == 'zpl'){
                        var printData =
                            [
                                '^XA',
                                '^CF0,40',
                                '^FO20,25^FD'+product.name+'^FS',
                                '^BY2,20,50',
                                '^FO20,75^BC^FD'+product.barcode+'^FS',
                                '^XZ',
                            ];
                    }
                    else{
                        var printData =
                            [
                                '\nN\n',
                                'q609\n',
                                'Q203,26\n',
                                'D7\n',
                                'A190,10,0,3,1,1,N,"'+product.name+'"\n',
                                'B190,60,0,1,1,2,60,B,"'+product.barcode+'"\n',
                                '\nP1,1\n'
                            ];
                    }
                    console.log("ddddddddddddd", printData)
                    qz.print(config, printData).catch(function(e) { console.error(e); });
                    });

            }).done(function() {
                location.reload();
                console.log("Printing done");
            });
    }

    function print_picking_label() {
        ajax.jsonRpc("/zebra" + controller_url, 'call', {})
            .then(function(res_data) {
                var config = getUpdatedConfig();
                var width = 1.25;
                var height = 1;
                rpc.query({
                    model: 'res.company',
                    method: 'read',
                    args: [[company_id], []],
                }).done(function(company) {
                    height = company[0].shipping_height
                    width = company[0].shipping_width
                });
                config.reconfigure({
                    size: {'width': width, 'height': height},
                });
                res_data.data.forEach(function(picking) {
                    if (printer_type == 'zpl'){
                        var printData =
                            [
                                '^XA',
                                '^CF0,40',
                                '^BY2,20,50',
                                '^FO20,25^BC^FD'+picking.label+'^FS',
                                '^XZ',
                            ];
                    }
                    else{
                        var printData =
                            [
                                '\nN\n',
                                'q609\n',
                                'Q203,26\n',
                                'B190,10,0,1,1,2,60,B,"'+picking.label+'"\n',
                                '\nP1,1\n'
                            ];
                    }
                    console.log("ddddddddddddd", printData)
                    qz.print(config, printData).catch(function(e) { console.error(e); });
                });

            }).done(function() {
                location.reload();
                console.log("Printing done");
            });
    }
    function print_location_label() {
        ajax.jsonRpc("/zebra" + controller_url, 'call', {})
            .then(function(res_data) {
                console.log("result", res_data);
                var config = getUpdatedConfig();
                var width = 1.25;
                var height = 1;
                rpc.query({
                    model: 'res.company',
                    method: 'read',
                    args: [[company_id], []],
                }).done(function(company) {
                    height = company[0].location_height
                    width = company[0].location_width
                });
                config.reconfigure({
                    size: {'width': width, 'height': height},
                });
                res_data.data.forEach(function(location) {
                    if (printer_type == 'zpl'){
                        var printData =
                            [
                                '^XA',
                                '^CF0,130',
                                '^FO100,120^FD'+location.name+'^FS',
                                '^BY2,20,120',
                                '^FO250,250^BC^FD'+location.barcode+'^FS',
                                '^XZ',
                            ];
                    }
                    else{
                        var printData =
                            [
                                '\nN\n',
                                'q609\n',
                                'Q203,26\n',
                                'D7\n',
                                'A190,10,0,3,1,1,N,"'+location.name+'"\n',
                                'B190,60,0,1,1,2,60,B,"'+location.barcode+'"\n',
                                '\nP1,1\n'
                            ];
                    }
                    console.log("ddddddddddddd", printData)
                    qz.print(config, printData).catch(function(e) { console.error(e); });
                    });

            }).done(function() {
                location.reload();
                console.log("Printing done");
            });
    }
});
