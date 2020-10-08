
odoo.define('pos_qz_printer.pos_receipt_print', function (require) {
    "use strict";

    let rpc = require('web.rpc');
    let screens = require('point_of_sale.screens');

    /// Authentication setup ///
    qz.security.setCertificatePromise(function(resolve, reject) {
        //Preferred method - from server
//        fetch("assets/signing/digital-certificate.txt", {cache: 'no-store', headers: {'Content-Type': 'text/plain'}})
//          .then(function(data) { data.ok ? resolve(data.text()) : reject(data.text()); });

        //Alternate method 1 - anonymous
//        resolve();  // remove this line in live environment

        //Alternate method 2 - direct

        //Aquí va el contenido de cert.pem
        resolve("-----BEGIN CERTIFICATE-----\n" +
            "MIIELTCCAxWgAwIBAgIUMFYIs4ORi2pNTM2YOrKD6yZX76owDQYJKoZIhvcNAQEL\n" +
            "BQAwgaQxCzAJBgNVBAYTAkNVMREwDwYDVQQIDAhIb2xndcKhbjERMA8GA1UEBwwI\n" +
            "SG9sZ3XCoW4xFTATBgNVBAoMDE9kb28gRXhwZXJ0czEVMBMGA1UECwwMT2RvbyBF\n" +
            "eHBlcnRzMRgwFgYDVQQDDA9vZG9vLnZtcC5jb20ubXgxJzAlBgkqhkiG9w0BCQEW\n" +
            "GHZsYWRpbWlyODgxMDAyQGdtYWlsLmNvbTAgFw0yMDEwMDcwMjI1MDFaGA8yMDUy\n" +
            "MDQwMTAyMjUwMVowgaQxCzAJBgNVBAYTAkNVMREwDwYDVQQIDAhIb2xndcKhbjER\n" +
            "MA8GA1UEBwwISG9sZ3XCoW4xFTATBgNVBAoMDE9kb28gRXhwZXJ0czEVMBMGA1UE\n" +
            "CwwMT2RvbyBFeHBlcnRzMRgwFgYDVQQDDA9vZG9vLnZtcC5jb20ubXgxJzAlBgkq\n" +
            "hkiG9w0BCQEWGHZsYWRpbWlyODgxMDAyQGdtYWlsLmNvbTCCASIwDQYJKoZIhvcN\n" +
            "AQEBBQADggEPADCCAQoCggEBANp4ZOmaVp9c4J+mEl+YCYwNS+iBgUQs4oZP+Vym\n" +
            "J3agvADis5nAQmmAAutG7kJKcJFz5nhRQU72tUlvTJkEjaUB3EXWwA+Yn20M0w/n\n" +
            "3dpUiE84+1ZSfM9SRnLxTx3fuD2wYx2lUTHMTKEjBeE5a+aABnYjlAjHA5LjR0PB\n" +
            "2xo8oq43DVYjAvbawcAVwLWGazAcyDX3YM4SYgU9dAvVZCRaCXRhJIVs+Wz1wiji\n" +
            "GwgyOAS3QeLB5bfK2Odisk9kLqUPIIO3e/2QT1EMfimfCf0emokVGu81BI5lN/kT\n" +
            "NmiQMeC3OSToy0KYI0e7bQ0mMNBC/2DQN0RpCRRe+NiaR7UCAwEAAaNTMFEwHQYD\n" +
            "VR0OBBYEFP1y6lg/2WSmPPj45Q4PvMkYWQMLMB8GA1UdIwQYMBaAFP1y6lg/2WSm\n" +
            "PPj45Q4PvMkYWQMLMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB\n" +
            "ADJuhh0dVT4cmT/b2T7KfRzq0NBoCoReIJE1j0gYiwtxQJ+o+Lp8PhMTjxCwFUek\n" +
            "iD79mVVW3PpR7uaa+3GAAKX3wcX6r7LtDQXSUr8jcgLEbAMp4IrzYVnsQ4cn5acv\n" +
            "1m/zYpH/ESLZopQDt1OYUaKCJAY8ds4UWBioK8pRR9fed7ohhDRUUhax8bPGAEpk\n" +
            "TLko/JKsTaBGCjW0EoFbf3yK3+wQ8yDVqjP4uhBuvdVUuTSqvpdkNF5AngvBZSuM\n" +
            "EwQaLRdX2GgzcKRH8CSAMTSeXbXof+9yMu+i8B7Ql3HQ7N/1tEh3fiQBNyIZ9FZ3\n" +
            "v3rkvCwfzN/NAaUpg7A3rjo=\n" +
            "-----END CERTIFICATE-----");
        //
        //     resolve("-----BEGIN CERTIFICATE-----\n" +
        //     "MIIEJzCCAw+gAwIBAgIUZBiEqLcWY/TFyR/k7iO+jczNN2MwDQYJKoZIhvcNAQEL\n" +
        //     "BQAwgaExCzAJBgNVBAYTAkNVMQ8wDQYDVQQIDAZIYXZhbmExFDASBgNVBAcMC0hh\n" +
        //     "dmFuYSBDaXR5MRgwFgYDVQQKDA9PZG9vIEV4cGVydHMgTVgxEDAOBgNVBAsMB0Rl\n" +
        //     "dmVsb3AxEjAQBgNVBAMMCWxvY2FsaG9zdDErMCkGCSqGSIb3DQEJARYcanVhbi5j\n" +
        //     "YXJsb3MuZmRlei44OWdtYWlsLmNvbTAgFw0yMDEwMDYwMTA2MzRaGA8yMDUyMDMz\n" +
        //     "MTAxMDYzNFowgaExCzAJBgNVBAYTAkNVMQ8wDQYDVQQIDAZIYXZhbmExFDASBgNV\n" +
        //     "BAcMC0hhdmFuYSBDaXR5MRgwFgYDVQQKDA9PZG9vIEV4cGVydHMgTVgxEDAOBgNV\n" +
        //     "BAsMB0RldmVsb3AxEjAQBgNVBAMMCWxvY2FsaG9zdDErMCkGCSqGSIb3DQEJARYc\n" +
        //     "anVhbi5jYXJsb3MuZmRlei44OWdtYWlsLmNvbTCCASIwDQYJKoZIhvcNAQEBBQAD\n" +
        //     "ggEPADCCAQoCggEBAMlBeIXH+LIS6hStsIgttPuE8bZiAuzlAvNqhXryrcibyD/7\n" +
        //     "6ciD4XJ2IUqmb7Zrmq8bmrVzvMg7OZOILk8PHYkPiFjASu/4t0evC+z+cXFdcycB\n" +
        //     "vlJSCyPpZTIKX5UeWspFeTgaqdcmJ4fNBtadm2R8JiaZgrQrIzL6Q5S9RMVTDRlU\n" +
        //     "BT6hy8J+INtFA5yN+OwmW6NgXcjQqiQZeMEqW0dzh0EnaNj0rGb6AWtBO4a9YyVD\n" +
        //     "o3BZVFJXFYaDjvQu+d62c9JEaw3RIOcmdwaiOXdIfvRg7NVXsc0dyuRe/vZyiyTl\n" +
        //     "7T2B3QrZ/SEN2f3gKqjcpd+gna4DG7I1K2AgH3ECAwEAAaNTMFEwHQYDVR0OBBYE\n" +
        //     "FA7Qo9waJBZr79JyN4NFKUjZiPxeMB8GA1UdIwQYMBaAFA7Qo9waJBZr79JyN4NF\n" +
        //     "KUjZiPxeMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAHhJrCTs\n" +
        //     "T7S9Id7Eug7T7LKnUu0tmDzDTXlXKCYcEzdCUZmmgz7YAGPSIljad+6Q6/gPtr4H\n" +
        //     "Ywk/7SIESW6X4SQnwUBrkVjerN1GFUimW8d2ubX3lxe82lxQgPNBMBhTLQe+Epys\n" +
        //     "kEUxdp6hH9x3NvtRBnSbE+KI1MFWDk9d+9Jh+jQJXRZbMS/BJFnVY9Eb2n/RIH/U\n" +
        //     "2sNGOnpjZZkAek4nmWpOqGIIWBfhgaQYWTPEWhUpJpMqVYrCg9/hgq1GZoAiujeU\n" +
        //     "Z6WuBNbG7cykdPR7QzM7PnKqAfGD08OHmiVsS+Egno7sWeCP/OogBm2L+LB2nJqu\n" +
        //     "8swChJSQx7mAuVE=\n" +
        //     "-----END CERTIFICATE-----");
    });

    //Aquí va el contenido de key.pem
    let privateKey = "-----BEGIN PRIVATE KEY-----\n" +
        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDaeGTpmlafXOCf\n" +
        "phJfmAmMDUvogYFELOKGT/lcpid2oLwA4rOZwEJpgALrRu5CSnCRc+Z4UUFO9rVJ\n" +
        "b0yZBI2lAdxF1sAPmJ9tDNMP593aVIhPOPtWUnzPUkZy8U8d37g9sGMdpVExzEyh\n" +
        "IwXhOWvmgAZ2I5QIxwOS40dDwdsaPKKuNw1WIwL22sHAFcC1hmswHMg192DOEmIF\n" +
        "PXQL1WQkWgl0YSSFbPls9cIo4hsIMjgEt0HiweW3ytjnYrJPZC6lDyCDt3v9kE9R\n" +
        "DH4pnwn9HpqJFRrvNQSOZTf5EzZokDHgtzkk6MtCmCNHu20NJjDQQv9g0DdEaQkU\n" +
        "XvjYmke1AgMBAAECggEASvmEUDL6RUifgcqBhbLsm9a4VTuUfCwXNVbe0e/nnSt+\n" +
        "OaOTVVGIuSIIXmwCOlfHl/M5hdME4a+C+Yerttu8LIOd743Kbc/H7qm3CT9egJ4A\n" +
        "BYgdoTs/v/qRWML9jtgHJ4yQB02Dtt5Q8f/N9cQ6BmmrTgHZvMVnsZI0E8nEgpTo\n" +
        "IdWZBXA4Jj3JlIGZtCzTtHggOGdDDwFcXZxb/Aip6bz4NvAdCPSmHg65ZPRTioQq\n" +
        "VWZmNzDePJxKLFBfJsCiFxqdDju5Sa6WKKZcqq9CR5N2DU+2KeCqOJ/EgvkjPE5q\n" +
        "bVXjxupK3JDpkzkpkKEeWaz+MDCuY2ejlqqj66vfwQKBgQD13stfptYcAMo+h/K7\n" +
        "CUFekUpgNyfHOH4ojk0cXSEQJyJNx3PyDPSQ5SM2OBWb1uCVzr1EBsyG0KB1zJE6\n" +
        "SMLkI/UvXlW++O16hPxbnFP79dFQLnJvAOikz53LtUIKkKFxY3t/ekrXWjN/zJzR\n" +
        "8xpfT4VrKzPmQyV4/tm409rwUQKBgQDjeJxUA6zE1Ot85hRb/Nm/2sZJnwvAE4f2\n" +
        "I3Dx1xqzjPSCdSNU8mbGuQHehekYUikF77dozQYe4iDrY9F8f2v6XUMB8rXNZIWx\n" +
        "vKJQjCIOWV8YvbW+NER5OhtPI/ZApTSepBbG5Rwpn2OxN8X2coNj1iNlO4IVv18N\n" +
        "HZCxquXMJQKBgCB/H/Y2gNoWqKR3J3fdE0zCe0gYQiOsrdACbuKu1G3kHj6VfBej\n" +
        "6rcz8eF6rDB6yBhEyPMyytmOvYaUUSWY9Fle/0sRdtfU4t5ssUYSdW854D5uxSUy\n" +
        "w4z0+/Auttnan9vywCHrMfUgsOnVS2zcasHqKsItZaCrg0potLIfHjLhAoGAV4St\n" +
        "KQns7CI7pGdlh+rl4JIM3oCJ5dHd6s7CAtpPFKvz20m0WVeWQXknBfWhtFDQJc+Q\n" +
        "UosngrRgFBDopazk34QIZvR6DFdTtQmtra3s4HZ0RzGeflrfyYCYxz8/3KlzcGIT\n" +
        "vVyjFESV97ZMvUBb2wqlvapCp5lkucgZRrJJDd0CgYEA0ZUE0oY5JAaP2mgJZDdP\n" +
        "57Pg9MUVcr1VLjY0VAGlCiVPtUu52n47WZKjjhAnOsa63SujqB626VowW9HLX/zF\n" +
        "N8xuYMpH8k/U8yOkUKl0i4PslUnbCWPGKTxGFy74UE7f2rsdxG/Apm4elBN7gCHV\n" +
        "pkMOnKY8PNW6ZsNrgNtzMzY=\n" +
        "-----END PRIVATE KEY-----";
    //
    //     let privateKey = "-----BEGIN PRIVATE KEY-----\n" +
    //     "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDJQXiFx/iyEuoU\n" +
    //     "rbCILbT7hPG2YgLs5QLzaoV68q3Im8g/++nIg+FydiFKpm+2a5qvG5q1c7zIOzmT\n" +
    //     "iC5PDx2JD4hYwErv+LdHrwvs/nFxXXMnAb5SUgsj6WUyCl+VHlrKRXk4GqnXJieH\n" +
    //     "zQbWnZtkfCYmmYK0KyMy+kOUvUTFUw0ZVAU+ocvCfiDbRQOcjfjsJlujYF3I0Kok\n" +
    //     "GXjBKltHc4dBJ2jY9Kxm+gFrQTuGvWMlQ6NwWVRSVxWGg470LvnetnPSRGsN0SDn\n" +
    //     "JncGojl3SH70YOzVV7HNHcrkXv72cosk5e09gd0K2f0hDdn94Cqo3KXfoJ2uAxuy\n" +
    //     "NStgIB9xAgMBAAECggEATGQZh048S/t59pdnJomS5NW1mfDiA2F6GUMZn212IWtg\n" +
    //     "O0k3l/DXJkdIo7lBNhDqCgWEV9OymJ5CYImUalXmdBv9ORLkXuodR4xeDnsWPF2o\n" +
    //     "U+oJf928dMkmrDPbzBJVi+mK9YzJYu0MnDNqoRP5485r/MLQJesp1TPBazfcXrlW\n" +
    //     "Hag+oJXdBq6N6yedFQ8YKplL6jUvomHOWTE7dOrXCCvMp33+C1AV1UwngB5xrjSl\n" +
    //     "vB9pq+0lJ2tLeFckY9ZcBqr0KUzbzBCxkaa1rzF8x5+mvgr3H2I3Bwplw/qx8jLh\n" +
    //     "pBnyY9p2nWm0MDaHG1CSgtKopKpWOKZiQ2LIUZd5QQKBgQD941g1SmCB9ZaDgmqJ\n" +
    //     "OTk3JS6alUyOYR3oceXP5HpTzD/vh9CbZg6ZF3+oVq1VSAREo/ZpDmzo/ZxTXBGV\n" +
    //     "ogKSmTtbbiu/hgAFiEiMMym2bvpKE3pgAgMrC0cptkf+pZt0XGK/c1+50K0nadBG\n" +
    //     "Hb6v3Z/sPBYAJSfG5JVTmHBXpQKBgQDK7guoWHwYZdV/CFyYeNuuNPGDMLnuCSEc\n" +
    //     "OfcuycUGAnAYc57ykMMS94fh/VdUEHjHuRvFe6nN9FwNFp5M2oWmE85h6FirRieo\n" +
    //     "iiCmuI7StwB22OWsdOLD1PcPBdOYfZO+/ZPIluqU7IlF6NtI2v0SXdoZ7cVePAnG\n" +
    //     "kBK8Mji+3QKBgQDr9ZgsZwTMo+AQN2wmPt2zJ8ZpeuqcxRvTxc9taI5cRU8Cono5\n" +
    //     "gx98Hv/RB0WvJfB5jt1bhEGqRNI+EypwpBK6BtnIvtq/9J0ehyvNyVsyJ3BM2k94\n" +
    //     "3UXuglvQI45D18xj190ay/KispPLNqeQEuL/df3Ew4868U1Hp3g1Kk721QKBgBTj\n" +
    //     "b/vCL/Pq95D98VoYhrRl6r5QU7M26VuYc+MzDb7SnWtG64OYdxwKssgGZejXUTdt\n" +
    //     "zHgFhLMYhikqvNy4Wa2AuGvHmOj4bbihjz7aHImAIOIa7XlVBsqVr2CyftdhhcXR\n" +
    //     "IFczga4WswKpN3lGYWp0krC8kuZiU7dGuUb5/HFZAoGAMznKFt44cUIhr0726P+0\n" +
    //     "rWI3+zJmCVKDdoHLPgKlEd+V7VYMdHsgf5B/JXctNYwOZlCR6W0/wUqkbBvDZVXj\n" +
    //     "ykDCjCifaWWPPsGaIaEp1KW0QYOox+AA8Y7NUoWr7+Za/jF2iZGl2FvVmu7Q7nB8\n" +
    //     "3y70XeowmZ1/UUf0hMw6pYQ=\n" +
    //     "-----END PRIVATE KEY-----";

    qz.security.setSignatureAlgorithm("SHA512"); // Since 2.1
    qz.security.setSignaturePromise(function(toSign) {
        return function(resolve, reject) {
            try {
                let pk = KEYUTIL.getKey(privateKey);
                let sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                sig.init(pk);
                sig.updateString(toSign);
                let hex = sig.sign();
                console.log("DEBUG: \n\n" + stob64(hextorstr(hex)));
                resolve(stob64(hextorstr(hex)));
            } catch (err) {
                console.error(err);
                reject(err);
            }
        };
    });

    /// Connection ///
    function startConnection(company_id, data2print) {
        if (!qz.websocket.isActive()) {
            qz.websocket.connect().then(function() {
                console.log('Connection success');
                findVersion(company_id, data2print);
            }).catch(function(err) {
                alert(err || 'Connection failed');
            });
        } else {
            getPrinterFromOdoo(company_id, data2print);
        }
    }

    /// Page load ///
    function findVersion(company_id, data2print) {
        qz.api.getVersion().then(function(data) {
            let qz_version = qz.version
            if (data !== qz_version)
                alert('QZ Tray Version must be equal to ' + qz_version);
            else
                getPrinterFromOdoo(company_id, data2print);
        }).catch(function(err) {
            alert(err || 'Connection failed');
        });
    }

    /// Detection ///
    // Based on findPrinter from sample.html file
    function getPrinterFromOdoo(company_id, data2print) {
        rpc.query({
                model: 'res.company',
                method: 'read',
                args: [[company_id], []],
            }, undefined
        ).done(function(company) {
            let pos_printer = company[0].pos_printer;
            qz.printers.find(pos_printer).then(function(printer) {
                console.log("Found: " + printer);
                setPrinter(printer);
                printReceipt(data2print);
            }).catch(function(err) {
                console.log("Found Printer Error:", err);
            });
        });
    }

    /// QZ Config ///
    // From sample.html check function named updateConfig
    let cfg = null;
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

    function setPrinter(printer) {
        let cf = getUpdatedConfig();
        cf.setPrinter(printer);
    }

    /// Pixel Printers ///
    function printReceipt(data2print) {
        let config = getUpdatedConfig();
        // From sample.html check function named getUpdatedOptions
        // let opts = getUpdatedOptions(true);
        let opts = {
            pageWidth: "", // $("#pPxlWidth").val(),
            pageHeight: "", // $("#pPxlHeight").val()
        };

        let printData = [
            {
                type: 'pixel',
                format: 'html',
                flavor: 'plain',
                data: '<html>' +
                    '<body>' +
                        data2print +
                    '</body>' +
                    '</html>',
                options: opts
            }
        ];

        qz.print(config, printData).catch(function(err) {
            alert(err || 'Connection failed');
        });
    }

    screens.ReceiptScreenWidget.include({
        print: function() {
            let company_id = this.pos.company.id;
            let data2print = '';
            let receipt = this.$('.pos-receipt-container')

            if(receipt.length > 0)
                data2print = receipt[0].outerHTML;
            else if (receipt.prevObject.length > 0)
                data2print = receipt.prevObject[0].outerHTML;

            if (data2print === '')
                this._super();
            else
                startConnection(company_id, data2print);
        },
    });
});