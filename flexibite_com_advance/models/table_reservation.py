# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################

from odoo import models, fields, api, _
from datetime import datetime,timedelta

class RestaurantTableReservation(models.Model):
    _name = 'restaurant.table.reservation'
    _description = 'Pos Restaurant Table Reservation'

    @api.model
    def reservation_validation(self, vals):
        duration_requested = int(vals.get('requested_duration'))
        requested_start_date_time = (datetime.strptime(vals.get('reserve_date_time'), '%Y-%m-%d %H:%M')).strftime("%Y-%m-%d %H:%M:%S")
        requested_end_date_time = (datetime.strptime(vals.get('reserve_date_time'), '%Y-%m-%d %H:%M') + timedelta(hours=duration_requested)).strftime("%Y-%m-%d %H:%M:%S")
        self.env.cr.execute("""select  id from restaurant_table_reservation rtr Where
                                                ((rtr.tbl_reserve_datetime BETWEEN %s AND %s) OR 
                                                (rtr.table_reserve_end_datetime BETWEEN %s AND %s)) OR  
                                                ((%s BETWEEN rtr.tbl_reserve_datetime AND rtr.table_reserve_end_datetime) OR
                                                (%s BETWEEN rtr.tbl_reserve_datetime AND rtr.table_reserve_end_datetime))
                                                 """, (requested_start_date_time,requested_end_date_time,
                                                       requested_start_date_time,requested_end_date_time,
                                                       requested_start_date_time,requested_end_date_time))
        table_data = self.env.cr.fetchall()
        res_rec = []
        if len(table_data)>0:
            for table_rec_id in table_data:
                table_record = self.browse(table_rec_id[0])
                if table_record.state != 'done':
                    res_rec.append(table_record)
            table_ids = []
            filterd_table = []
            for rec in res_rec:
                for table_id in rec.table_ids:
                    table_ids.append(table_id.id)
            filterd_table = set(table_ids) 
            result = list(filterd_table)
            return result
        else:
            return False

    order_id = fields.Many2one('pos.order', string="Order Id")
    tbl_reserve_datetime = fields.Datetime(string="Table Reserve Datetime")
    table_reserve_end_datetime = fields.Datetime(string="Table Reservation End Time")
    table_reserve_amount = fields.Float(string="Reservation Fees")
    table_ids = fields.Many2many('restaurant.table', string="Table")
    seats = fields.Integer(string="Seats")
    partner_id = fields.Many2one('res.partner', string="Partner")
    state = fields.Selection([('draft','New'),('confirm','Confirm'), ('done','Done')],string="State")

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: