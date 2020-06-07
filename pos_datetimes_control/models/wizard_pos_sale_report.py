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

from odoo import fields, models, api, _
from odoo.exceptions import Warning
import logging
_logger = logging.getLogger(__name__)

class wizard_pos_sale_report(models.TransientModel):
    _name = 'wizard.pos.sale.report'
    _description = 'wizard pos sale report'

    @api.model
    def get_ip(self):
        proxy_ip = self.env['res.users'].browse([self._uid]).company_id.report_ip_address or''
        return proxy_ip

    @api.multi
    def print_receipt(self):
        datas = {'ids': self._ids,
                 'form': self.read()[0],
                 'model': 'wizard.pos.sale.report'
                 }
        return self.env.ref('flexibite_com_advance.report_pos_sales_pdf').report_action(self, data=datas)

    #session_ids = fields.Many2many('pos.session', 'pos_session_list', 'wizard_id', 'session_id', string="Closed Session(s)")
    report_type = fields.Selection([('thermal', 'Thermal'),
                                    ('pdf', 'PDF')], default='pdf', string="Report Type")
    proxy_ip = fields.Char(string="Proxy IP", default=get_ip)


    session_ids = fields.Many2many('pos.session', 'pos_session_list', 'wizard_id', 'session_id', string="Closed Session(s)")
    
    def Z_report_get_closed_sessions_between_datetime(self):        
        company = self.env['res.company'].browse(self.env.user.company_id.id)
        #_logger.warning([('state','=','closed'),('start_at','>=',company.start_day_datetime),('start_at','<=',company.ends_day_datetime)])
        pos_sessions = self.env['pos.session'].search([('state','=','closed'),('start_at','>=',company.start_day_datetime),('start_at','<=',company.ends_day_datetime)])
        ids = []
        for pos_session in pos_sessions:
            ids.append(pos_session.id)
        return ids
    
    def Z_report_set_sessions(self):
        ids = self.Z_report_get_closed_sessions_between_datetime()
        self.session_ids = [(6, 0, ids)]
        return ids

    @api.onchange('session_ids')
    def ch_session_ids(self):
        count = 0
        if(self.session_ids):
            for _id in self.session_ids:
                count = count + 1
        if(count==0):
            self.Z_report_set_sessions()

class wizard_pos_x_report(models.TransientModel):
    _name = 'wizard.pos.x.report'
    _description = 'wizard pos x report'

    @api.model
    def get_ip(self):
        proxy_ip = self.env['res.users'].browse([self._uid]).company_id.report_ip_address or''
        return proxy_ip


    session_ids = fields.Many2many('pos.session', 'pos_session_wizard_rel', 'x_wizard_id','pos_session_id', string="Session(s)")
    report_type = fields.Selection([('pdf', 'PDF')], default='pdf', string="Report Type")
    proxy_ip = fields.Char(string="Proxy IP", default=get_ip)
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
