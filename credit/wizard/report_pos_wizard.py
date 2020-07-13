# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError
from dateutil import relativedelta
from datetime import datetime, date, timedelta
from odoo.http import request
import pytz
import logging
import locale

_logger = logging.getLogger(__name__)


class ReportPosWizard(models.TransientModel):
    _name = 'credit.report_pos_wizard'
    _description = 'Wizard para el reporte de las ventas en POS '


    start_date = fields.Datetime(string='Fecha y Hora inicial', required=True)
    end_date = fields.Datetime(string='Fecha y Hora Final', required=True)
    end_date_copy = fields.Datetime(string='Fecha y Hora Final')
    company_id = fields.Many2one('res.company', string='Compañia',)
    partner_id = fields.Many2one('res.partner', string='Cliente',)
    check_mail = fields.Boolean(string='Enviar por Correo',)
    check_format_date = fields.Boolean(string="Reporte Diario", default=False)
    email_to = fields.Many2many('res.partner', string='Destinatarios')

    @api.multi
    @api.onchange('partner_id')
    def _default_date_report(self):
        contracts = self.env['contract.contract'].search([('partner_id', '=', self.partner_id.id), ('active', '=', True)])
        if not contracts:
            contracts = self.env['contract.contract'].search(
                [('partner_id', '=', self.partner_id.parent_id.id), ('active', '=', True)])

        for c in contracts:
            for lc in c.contract_line_ids:
                if lc.next_period_date_start and lc.next_period_date_end:
                    start_date_utc = datetime(year=lc.next_period_date_start.year, month=lc.next_period_date_start.month,
                                                    day=lc.next_period_date_start.day, hour=0, minute=0, second=0)
                    end_date_utc = datetime(year=lc.next_period_date_end.year, month=lc.next_period_date_end.month, day=lc.next_period_date_end.day,
                                                  hour=23, minute=59, second=59)
                    # Temporal, luego mejorar
                    tz = pytz.timezone(self.env.user.tz) if self.env.user.tz else pytz.utc
                    if str(tz) == 'Mexico/General':
                        start_date_utc = start_date_utc + timedelta(hours=5)
                        end_date_utc = end_date_utc + timedelta(hours=5)
                    self.start_date = start_date_utc
                    self.end_date = end_date_utc

    @api.onchange('check_format_date')
    def _onchange_check(self):
        if self.check_format_date:
            self.start_date = datetime(year=self.start_date.year, month=self.start_date.month, day=self.start_date.day, hour=0, minute=0, second=0)
            self.end_date = datetime(year=self.start_date.year, month=self.start_date.month, day=self.start_date.day, hour=23, minute=59, second=59)
            # Temporal, luego mejorar
            tz = pytz.timezone(self.env.user.tz) if self.env.user.tz else pytz.utc
            if str(tz) == 'Mexico/General':
                self.start_date = self.start_date + timedelta(hours=5)
                self.end_date = self.end_date + timedelta(hours=5)

    @api.multi
    def consult_credit_details(self):
        one = self.start_date
        two = self.end_date
        partner_ids = self.partner_id.child_ids.mapped('id')
        partner_ids.append(self.partner_id.id)
        orders = self.env['pos.order'].search([('company_id', '=', self.company_id.id),
                                               ('partner_id', 'in', partner_ids),
                                               ('credit_amount', '>', 0),
                                               ('date_order', '>=', one), ('date_order', '<=', two)])
        importes_por_persona = dict()
        res = []
        sum = 0
        if orders:
            for o in orders:
                if o.partner_id in importes_por_persona:
                    importes_por_persona[o.partner_id] += o.amount_total
                else:
                    importes_por_persona[o.partner_id] = o.amount_total
            for key, value in importes_por_persona.items():
                res.append({
                    'client_number': key.client_number,
                    'cliente_principal': key.parent_id.name,
                    'cliente': key.name,
                    'importe': value,
                    })
                sum += value
            return res, sum
        else:
            raise ValidationError("No Tiene Información para Mostrar ")

    @api.multi
    def get_report_credit_details(self):
        action = self.get_details()
        if self.check_mail:
            self.send_mail_report(action)
        return action

    @api.multi
    def get_details(self):
        res, sum = self.consult_credit_details()
        try:
            locale.setlocale(locale.LC_TIME, 'es_ES.utf8')
        except:
            pass
        data = {
            'orders': res,
            'total': sum,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'cut_date': datetime.strftime(self.end_date, '%d-%b-%Y'),
            'days': (self.end_date - self.start_date).days,
        }
        return self.env.ref('credit.action_report_credit_summary').report_action(self, data=data, config=False)

    @api.multi
    def sale_report_pos(self):
        one = self.start_date
        two = self.end_date
        view_id = self.env.ref('point_of_sale.view_pos_order_tree').id
        domain = [('date_order', '>=', one), ('date_order', '<=', two)]
        return {
            'type': 'ir.actions.act_window',
            'name': 'Ventas de los Clientes',
            'res_model': 'pos.order',
            'view_type': 'form',
            'view_mode': 'form',
            'views': [(view_id, 'tree')],
            'domain': domain,
        }

    @api.multi
    def send_mail_report(self, action):
        template = self.env.ref('credit.email_template_reporte_credito')
        template.report_template = action
        template = template.generate_email(self.id)

        self.send(template) # enviar


    def send(self, template):
        # objeto odoo de correo
        mail = self.env['mail.mail']
        if not self.email_to:
            raise ValidationError("No se encontraron destinatarios de correo")
        for partner in self.email_to:
            email_to += partner.email
            email_to += ','
        email_to = email_to[:-1]
        print(email_to)
        mail_data = {
            'subject': 'Reporte de Crédito General',
            'body_html': template['body_html'],
            'email_to': email_to,
            'email_from': template['email_from'],
        }
        print(self.partner_id.email)
        mail_out=mail.create(mail_data)
        if mail_out:
            mail.send(mail_out)
            _logger.info("Reporte de Pos Enviado📬")