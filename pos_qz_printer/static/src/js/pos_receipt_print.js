
odoo.define('pos_qz_printer.pos_receipt_print', function (require) {
"use strict";

var core = require('web.core');
var ajax = require('web.ajax');
var framework = require('web.framework');
var Dialog = require('web.Dialog');
var action_model = null;
var controller = null;
var company_id = null;
var controller_url = null;
var PopupWidget = require('point_of_sale.popups');
var gui = require('point_of_sale.gui');
var models = require('point_of_sale.models');
var screens = require('point_of_sale.screens');
var QWeb = core.qweb;
var web_data = require('web.data');

var _t = core._t;
var qzVersion = 0;
var data_to_print = ''

    function findVersion() {
        qz.api.getVersion().then(function(data) {
            qzVersion = data;
        });
    }

    function startConnection(config) {
        qz.security.setCertificatePromise(function(resolve, reject) {
            $.ajax("/pos_qz_printer/static/src/lib/digital-certificate.txt").then(resolve, reject);
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
        var ds = new web_data.DataSet(this, 'res.company');
        ds.call('read', [company_id]).done(function (company) {
            qz.printers.find(company[0].pos_printer).then(function(data) {
                 console.log("Found: " + data);
                 setPrinter(data);
             }).catch(function(err) {
             console.log("Found Printer Error:", err);
            });
        });
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
            printReceipt();
        }
    }
    /// QZ Config ///
    var cfg = null;

    function getUpdatedConfig() {
        if (cfg == null) {
            cfg = qz.configs.create(null);
        }

        cfg.reconfigure({
            copies: 1,
            margins: {top: 0, left: 0.75},

        });
        return cfg
    }
    function printReceipt() {
        var config = getUpdatedConfig();
            var printData =
            [
                data_to_print
           ];
            console.log("ddddddddddddd", printData)
            qz.print(config, printData).catch(function(e) { console.error(e); });
        location.reload();
    }
screens.ReceiptScreenWidget.include({
        print: function() {
            var self = this;
            if(self.template != 'ReceiptScreenWidget'){
                self._super();
                return;
            }
            company_id = self.pos.company.id
            var order = self.pos.get_order();
            var receipt = self.$('.pos-receipt-container').html(QWeb.render('PosTicket',{
                    widget:self,
                    order: order,
                    receipt: order.export_for_printing(),
                    orderlines: order.get_orderlines(),
                    paymentlines: order.get_paymentlines(),
                }));
            data_to_print = receipt[0]['outerText']
            startConnection();
        },
    });
});