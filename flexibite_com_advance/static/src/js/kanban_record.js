odoo.define('flexibite_com_advance.kanban_record', function (require) {
"use strict";

	var KanbanRecord = require('web.KanbanRecord');
	var Session = require('web.Session');
	var rpc = require('web.rpc');

	KanbanRecord.include({
		events: _.extend({}, KanbanRecord.prototype.events, {
			'click .pos_line_print': 'pos_line_print',
			'click .main_print_button': 'main_print_button',
			'click .pos_line_button': 'pos_line_button',
        }),
        pos_line_print: function(e){
        	var self = this;
            var kitchen_button_id = $(e.currentTarget).attr('id');
            var url = $(e.currentTarget).attr('ip');
//            PDF Report
	        self.do_action('flexibite_com_advance.report_item_table_order_id',{additional_context:{
	            active_ids:[kitchen_button_id],
	        }}).fail(function(error){
	        	console.log("Connection lost", error);
	        });
//	        Thermal Report
            var report_name = "flexibite_com_advance.report_item_table_order1";
            var params = {
				model: 'ir.actions.report',
				method: 'get_html_report',
				args: [Number(kitchen_button_id), report_name],
			}
			rpc.query(params, {async: false})
			.then(function(report_html){
				if(report_html){
					self.connection = new Session(undefined,url, { use_cors: true});
					self.connection.rpc('/hw_proxy/print_xml_receipt',{receipt: report_html[0]},{timeout: 8000})
                    .then(function(){
//                            send_printing_job();
                    },function(e){
//                            self.receipt_queue.unshift(r);
                    });
				}
			});
        },
        main_print_button: function(e){
        	var self = this;
            var kitchen_button_id = $('#current_id span').text();
            var url = $(e.currentTarget).attr('ip');
//            PDF Report
	        self.do_action('flexibite_com_advance.report_table_order_id',{additional_context:{
	            active_ids:[kitchen_button_id],
	        }}).fail(function(error){
	        	console.log("Connection lost", error);
	        });
//	        Thermal Report
//            var report_name = "flexibite_com_advance.report_table_order_receipt";
//            var params = {
//				model: 'ir.actions.report',
//				method: 'get_html_report',
//				args: [Number(kitchen_button_id), report_name],
//			}
//			rpc.query(params, {async: false})
//			.then(function(report_html){
//				console.log("report_html >>>>> ",report_html);
//				if(report_html){
//					self.connection = new Session(undefined,url, { use_cors: true});
//					console.log("self.connection >>>> ",self.connection);
//					self.connection.rpc('/hw_proxy/print_xml_receipt',{receipt: report_html[0]},{timeout: 8000})
//                    .then(function(){
////                            send_printing_job();
//                    },function(e){
////                            self.receipt_queue.unshift(r);
//                    });
//				}
//			});
        },
        pos_line_button: function(e){
        	var self = this;
        	var button_id = parseInt($(e.currentTarget).attr('id'));
        	if(button_id){
        		var params = {
					model: 'pos.order',
					method: 'check_status',
					args: [button_id],
				}
				rpc.query(params, {async: false}).then(function(result){});
        	}else{
        		alert("Record id not found!");
        	}
        },
	})

});