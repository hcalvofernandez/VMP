# -*- coding:utf-8 -*-

from odoo import models, api

from datetime import date, datetime
import pytz

class ReportCreditSummaryIndividual(models.AbstractModel):
    _name = 'report.credit.report_credit_summary_individual'

    @api.model
    def _get_report_values(self, docids, data=None):
        data = data.copy()
        if 'start_date' not in data:
            data.update(self._context)
        partner_id = data['partner_id']
        partner = self.env['res.partner'].browse(partner_id)
        partner_ids = [partner_id, partner.parent_id.id]
        contract_id = self.env['contract.contract'].search([('partner_id', 'in', partner_ids),
                                                            ('type_contract', '=', 'credito')])
        max_pay_date = ""
        if contract_id:
            contract = contract_id[0]
            if len(contract_id) > 1:
                if contract_id[0].partner_id.id == partner_id:
                    contract = contract_id[0]
                elif contract_id[1].partner_id.id == partner_id:
                    contract = contract_id[1]

            if contract.payment_term_id:
                result = contract.payment_term_id.compute(5, data['end_date'])
                max_pay_date = date.strftime(datetime.strptime(result[0][0][0], '%Y-%m-%d'), '%d-%b-%Y')

        time_zone = self._context.get('tz')
        if not time_zone:
            time_zone = 'Mexico/General'
        tz = pytz.timezone(time_zone)
        start_date_localized = pytz.utc.localize(datetime.strptime(data['start_date'], '%Y-%m-%d %H:%M:%S')).astimezone(tz)
        end_date_localized = pytz.utc.localize(datetime.strptime(data['end_date'], '%Y-%m-%d %H:%M:%S')).astimezone(tz)

        return {
            # 'context': data['context'],
            'orders': data['orders'],
            'total': data['total'],
            'start_date': data['start_date'],
            'end_date': data['end_date'],
            'start_date_format': date.strftime(start_date_localized, '%d-%b-%Y'),
            'end_date_format': date.strftime(end_date_localized, '%d-%b-%Y'),
            'cut_date': datetime.strftime(end_date_localized, '%d-%b-%Y'),
            'days': data['days'],
            "company_currency": self.env.user.company_id.currency_id,
            "partner": partner,
            'max_pay_date': max_pay_date,
            'last_period_total': data['last_period_total'] if 'last_period_total' in data else 0.00
        }


class ReportCreditSummary(models.AbstractModel):
    _name = 'report.credit.report_credit_summary'

    @api.model
    def _get_report_values(self, docids, data=None):
        data = data.copy()
        if 'start_date' not in data:
            data.update(self._context)
        partner_id = data['context']['partner_id']
        partner = self.env['res.partner'].browse(partner_id)
        partner_ids = [partner_id, partner.parent_id.id]
        contract_id = self.env['contract.contract'].search([('partner_id', 'in', partner_ids),
                                                            ('type_contract', '=', 'credito')])
        max_pay_date = ""
        if contract_id:
            contract = contract_id[0]
            if len(contract_id) > 1:
                if contract_id[0].partner_id.id == partner_id:
                    contract = contract_id[0]
                elif contract_id[1].partner_id.id == partner_id:
                    contract = contract_id[1]

            if contract.payment_term_id:
                result = contract.payment_term_id.compute(5, data['end_date'])
                max_pay_date = date.strftime(datetime.strptime(result[0][0][0], '%Y-%m-%d'), '%d-%b-%Y')

        return {
            'context': data['context'],
            'orders': data['orders'],
            'total': data['total'],
            'start_date': data['start_date'],
            'end_date': data['end_date'],
            'start_date_format': date.strftime(datetime.strptime(data['start_date'], '%Y-%m-%d %H:%M:%S'), '%d-%b-%Y'),
            'end_date_format': date.strftime(datetime.strptime(data['end_date'], '%Y-%m-%d %H:%M:%S'), '%d-%b-%Y'),
            'cut_date': data['cut_date'],
            'days': data['days'],
            'company_currency': self.env.user.company_id.currency_id,
            'partner': partner,
            'max_pay_date': max_pay_date,
            'last_period_total': data['last_period_total'] if 'last_period_total' in data else 0.00,
        }
