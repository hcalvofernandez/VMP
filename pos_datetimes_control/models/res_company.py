# -*- coding: utf-8 -*-

from odoo import models, fields, api
from datetime import datetime,timedelta
from odoo.exceptions import Warning
import logging

_logger = logging.getLogger('___________________________________' + __name__)


class res_company(models.Model):
    _inherit = 'res.company'

    start_day_datetime = fields.Datetime(string="Inicio", default=datetime.now())
    ends_day_datetime  = fields.Datetime(string="Fin", default=datetime.now())
    is_autocomputed = fields.Boolean("¿Automatizar Fechas?", default=True)

    def get_is_autocomputed(self):
        return self.is_autocomputed
    
    def get_start_day_datetime(self):
        return self.start_day_datetime
    
    def get_ends_day_datetime(self):
        return self.ends_day_datetime

    @api.onchange('start_day_datetime')
    def ch_start_day_datetime(self):
        self.is_valid_datetimes()
        pass 

    @api.onchange('ends_day_datetime')
    def ch_ends_day_datetime(self):
        self.is_valid_datetimes()
        pass     

    def is_valid_datetimes(self):
        if(self.start_day_datetime >= self.ends_day_datetime):
            raise Warning('Debe establecer un horario fin mayor a un inicio para el control del POS.')
        return True
    
    @api.model
    def is_current_datetime_between(self, params):
        current_datetime = datetime.now()
        if(self):
            if(current_datetime < self.start_day_datetime or current_datetime > self.ends_day_datetime):
                return False
            else:
                return True
        else:
            company = self.env['res.company'].browse(self.env.user.company_id.id)
            if(current_datetime < company.start_day_datetime or current_datetime > company.ends_day_datetime):
                return False
            else:
                return True

    def is_current_datetime_between_internal(self,start, ends, company):
        current_datetime = datetime.now()
        if(self):
            if(current_datetime < start or current_datetime > ends):
                return False
            else:
                return True
        else:
            if(current_datetime < company.start_day_datetime or current_datetime > company.ends_day_datetime):
                return False
            else:
                return True

    def cron_set_next_day_datetimes(self):
        companies = self.env['res.company'].search([])
        for company in companies:
            is_current_time_between = self.is_current_datetime_between_internal(company.start_day_datetime, company.ends_day_datetime, company)
            #raise Warning(is_current_time_between)
            if(not is_current_time_between):
                new_start_day_datetime = company.start_day_datetime + timedelta(days=1)
                new_ends_day_datetime = company.ends_day_datetime + timedelta(days=1)
                _company = self.env['res.company'].browse(company.id)
                _company.sudo().update({'start_day_datetime':new_start_day_datetime,'ends_day_datetime':new_ends_day_datetime})                
                pass
            else:
                pass

class AccountBankStatementLine(models.Model):
    _inherit = "account.bank.statement"

    difference_custom = fields.Monetary(compute='_display_custom_balance', store=False, help="Difference between the computed ending balance and the specified ending balance.")
    balance_end_real_declared = fields.Monetary('Declarado')

    @api.depends('balance_end_real')
    def _display_custom_balance(self):
        new_difference_custom = float(0)
        for record in self:
            statement = self.env['account.bank.statement'].browse(record.id)
            orders = record.pos_session_id.mapped('order_ids')
            for order in orders.filtered(lambda o: o.mapped('statement_ids.journal_id.id')[0] == record.journal_id.id):
                new_difference_custom = order.amount_total - record.balance_end_real_declared
                statement.update({'difference_custom':new_difference_custom})

        #raise Warning (str(self.balance_start) + str(" - ") + str(self.balance_end_real_declared) + str("=") + str(self.difference_custom))
