# -*- coding: utf-8 -*-

import time
from datetime import datetime, timedelta
from odoo import api, fields, models, _
from . excel_styles import ExcelStyles
from odoo.exceptions import UserError, ValidationError
import xlwt
import io
import base64
import pdb

class AccountingreportOutput(models.TransientModel):
    _name = "accounting.report.output"
    _description = "Account Balance Report Output"
    
    name = fields.Char(string='File Name', readonly=True)
    output = fields.Binary(string='Format', readonly=True)


class AccountingReport(models.TransientModel):
    _name = "accounting.report"
    _inherit = "account.common.report"
    _description = "Accounting Report"

    @api.model
    def _get_account_report(self):
        reports = []
        if self._context.get('active_id'):
            menu = self.env['ir.ui.menu'].browse(self._context.get('active_id')).name
            reports = self.env['account.financial.report'].search([('name', 'ilike', menu)])
        return reports and reports[0] or False

    enable_filter = fields.Boolean(string='Enable Comparison')
    account_report_id = fields.Many2one('account.financial.report', string='Account Reports', required=True, default=_get_account_report)
    label_filter = fields.Char(string='Column Label', help="This label will be displayed on report to show the balance computed for the given comparison filter.")
    filter_cmp = fields.Selection([('filter_no', 'No Filters'), ('filter_date', 'Date')], string='Filter by', required=True, default='filter_no')
    date_from_cmp = fields.Date(string='Start Date')
    date_to_cmp = fields.Date(string='End Date')
    debit_credit = fields.Boolean(string='Display Debit/Credit Columns', help="This option allows you to get more details about the way your balances are computed. Because it is space consuming, we do not allow to use it while doing a comparison.")
    hierarchy_type = fields.Selection([('hierarchy', 'Hierarchy Print'), ('normal', 'Normal Print')], string='Print Type', default="hierarchy")
    
    
    @api.onchange('enable_filter')
    def onchange_enable_filter(self):
        if self.enable_filter:
            self.debit_credit = False
    
    def _build_comparison_context(self, data):
        result = {}
        result['journal_ids'] = 'journal_ids' in data['form'] and data['form']['journal_ids'] or False
        result['state'] = 'target_move' in data['form'] and data['form']['target_move'] or ''
        if data['form']['filter_cmp'] == 'filter_date':
            result['date_from'] = data['form']['date_from_cmp']
            result['date_to'] = data['form']['date_to_cmp']
            result['strict_range'] = True
        return result

    @api.multi
    def check_report(self):
        res = super(AccountingReport, self).check_report()
        data = {}
        data['form'] = self.read(['account_report_id', 'date_from_cmp', 'date_to_cmp', 'journal_ids', 'filter_cmp', 'target_move'])[0]
        print ("\n\n\n===============dataform",data['form'])
        for field in ['account_report_id']:
            if isinstance(data['form'][field], tuple):
                data['form'][field] = data['form'][field][0]
        comparison_context = self._build_comparison_context(data)
        res['data']['form']['comparison_context'] = comparison_context
        return res

    def _print_report(self, data):
        data['form'].update(self.read(['date_from_cmp', 'debit_credit', 'date_to_cmp', 'filter_cmp', 'account_report_id', 'enable_filter', 'label_filter', 'target_move'])[0])
        return self.env.ref('financial_reports.action_report_financial').report_action(self, data=data, config=False)
    
    def _compute_account_balance(self, accounts):
        """ compute the balance, debit and credit for the provided accounts
        """
        mapping = {
            'balance': "COALESCE(SUM(debit),0) - COALESCE(SUM(credit), 0) as balance",
            'debit': "COALESCE(SUM(debit), 0) as debit",
            'credit': "COALESCE(SUM(credit), 0) as credit",
        }

        res = {}
        for account in accounts:
            res[account.id] = dict.fromkeys(mapping, 0.0)
        if accounts:
            tables, where_clause, where_params = self.env['account.move.line']._query_get()
            tables = tables.replace('"', '') if tables else "account_move_line"
            wheres = [""]
            if where_clause.strip():
                wheres.append(where_clause.strip())
            filters = " AND ".join(wheres)
            request = "SELECT account_id as id, " + ', '.join(mapping.values()) + \
                       " FROM " + tables + \
                       " WHERE account_id IN %s " \
                            + filters + \
                       " GROUP BY account_id"
            params = (tuple(accounts._ids),) + tuple(where_params)
            print ("\n\n\n\n\n\n=========params", request % tuple(params))
            self.env.cr.execute(request, params)
            for row in self.env.cr.dictfetchall():
                res[row['id']] = row
        return res
    
    def _compute_report_balance(self, reports):
        '''returns a dictionary with key=the ID of a record and value=the credit, debit and balance amount
           computed for this record. If the record is of type :
               'accounts' : it's the sum of the linked accounts
               'account_type' : it's the sum of leaf accounts with such an account_type
               'account_report' : it's the amount of the related report
               'sum' : it's the sum of the children of this record (aka a 'view' record)'''
        res = {}
        fields = ['credit', 'debit', 'balance']
        for report in reports:
            if report.id in res:
                continue
            res[report.id] = dict((fn, 0.0) for fn in fields)
            if report.type == 'accounts':
                # it's the sum of the linked accounts
                res[report.id]['account'] = self._compute_account_balance(report.account_ids)
                for value in res[report.id]['account'].values():
                    for field in fields:
                        res[report.id][field] += value.get(field)
            elif report.type == 'account_type':
                # it's the sum the leaf accounts with such an account type
                accounts = self.env['account.account'].search([('user_type_id', 'in', report.account_type_ids.ids)])
                print ("\n\n\n\n===========accounts",accounts)
                res[report.id]['account'] = self._compute_account_balance(accounts)
                for value in res[report.id]['account'].values():
                    for field in fields:
                        res[report.id][field] += value.get(field)
            elif report.type == 'account_report' and report.account_report_id:
                # it's the amount of the linked report
                res2 = self._compute_report_balance(report.account_report_id)
                for key, value in res2.items():
                    for field in fields:
                        res[report.id][field] += value[field]
            elif report.type == 'sum':
                # it's the sum of the children of this account.report
                res2 = self._compute_report_balance(report.children_ids)
                for key, value in res2.items():
                    for field in fields:
                        res[report.id][field] += value[field]
        return res
    
    def get_account_lines_hierarchy(self, data):
        account_obj = self.env['account.account']
        currency_obj = self.env['res.currency']
        lines = []
        account_report = self.env['account.financial.report'].search([('id', '=', data['account_report_id'][0])])
        child_reports = account_report.with_context(data.get('used_context'))._get_children_by_order()
        for report in child_reports:
            vals = {
                'name': report.name,
                'balance': report.balance * report.sign or 0.0,
                'type': 'report',
                'level': bool(report.style_overwrite) and report.style_overwrite or report.level,
                'account_type': report.type =='sum' and 'view' or False,
            }
            if data['other_currency']:
                vals['amount_currency'] = 0.00
                vals['currency_symbol'] = ""
            if data['debit_credit']:
                vals['debit'] = report.debit
                vals['credit'] = report.credit
                
            if data['enable_filter']:
                vals['balance_cmp'] = report.with_context(data.get('comparison_context')).balance * report.sign
                if data['other_currency']:
                    vals['balance_cmp_amount_currency'] = 0.00
                    vals['balance_cmp_currency_symbol'] = ""
                
            lines.append(vals)
            
            account_ids = []
            if report.display_detail == 'no_detail':
                continue
                
            if report.type == 'accounts' and report.account_ids:
                account_ids = account_obj.with_context(data.get('used_context'))._get_children_and_consol([x.id for x in report.account_ids])
            elif report.type == 'account_type' and report.account_type_ids:
                account_ids = account_obj.with_context(data.get('used_context')).search([('user_type_id','in', [x.id for x in report.account_type_ids])])
            if account_ids:
                sub_lines = []
                for account in account_ids:
                    if report.display_detail == 'detail_flat' and account.internal_type == 'view':
                        continue
                    flag = False
                    vals = {
                        'name': account.code + ' ' + account.name,
                        'balance':  account.balance != 0 and account.balance * report.sign or account.balance,
                        'type': 'account',
                        'level': report.display_detail == 'detail_with_hierarchy' and min(account.level + 1,6) or 6, #account.level + 1
                        'account_type': account.internal_type,
                    }
                    
                    if data['other_currency']:
                        vals['amount_currency'] = account.balance_amount_currency
                        vals['currency_symbol'] = account.currency_id and account.currency_id.symbol or ""
                        
                    if data['debit_credit']:
                        vals['debit'] = account.debit
                        vals['credit'] = account.credit
                        if not account.company_id.currency_id.is_zero(vals['debit']) or not account.company_id.currency_id.is_zero(vals['credit']):
                            flag = True
                    if not account.company_id.currency_id.is_zero(vals['balance']):
                        flag = True
                    if data['enable_filter']:
                        vals['balance_cmp'] = account.balance * report.sign
                        if data['other_currency']:
                            vals['balance_cmp_amount_currency'] = account.balance_amount_currency
                            vals['balance_cmp_currency_symbol'] = account.currency_id and account.currency_id.symbol or ""
                        if not account.company_id.currency_id.is_zero(vals['balance_cmp']):
                            flag = True
                    if flag:
                        sub_lines.append(vals)
                lines += sorted(sub_lines, key=lambda sub_line: sub_line['name'])
        return lines
    
    def get_account_lines(self, data):
        lines = []
        print ("\n\n\n======data['account_report_id'][0]",data['account_report_id'][0])
        account_report = self.env['account.financial.report'].search([('id', '=', data['account_report_id'][0])])
        child_reports = account_report._get_children_by_order()
        res = self.with_context(data.get('used_context'))._compute_report_balance(child_reports)
        if data['enable_filter']:
            comparison_res = self.with_context(data.get('comparison_context'))._compute_report_balance(child_reports)
            for report_id, value in comparison_res.items():
                res[report_id]['comp_bal'] = value['balance']
                report_acc = res[report_id].get('account')
                if report_acc:
                    for account_id, val in comparison_res[report_id].get('account').items():
                        report_acc[account_id]['comp_bal'] = val['balance']
        for report in child_reports:
            print ('\n\n\n===========reprot====',report)
            vals = {
                'name': report.name,
                'balance': res[report.id]['balance'] * report.sign,
                'type': 'report',
                'level': bool(report.style_overwrite) and report.style_overwrite or report.level,
                'account_type': report.type or False, #used to underline the financial report balances
                'report_side': report.report_side
            }
            if report.report_side and report.report_side == 'right':
                data['right'] = True
            print ("\n\n\n\n===========right=====================",data.get('right'))
            if data['debit_credit']:
                vals['debit'] = res[report.id]['debit']
                vals['credit'] = res[report.id]['credit']

            if data['enable_filter']:
                vals['balance_cmp'] = res[report.id]['comp_bal'] * report.sign

            lines.append(vals)
            if report.display_detail == 'no_detail':
                #the rest of the loop is used to display the details of the financial report, so it's not needed here.
                continue

            if res[report.id].get('account'):
                sub_lines = []
                for account_id, value in res[report.id]['account'].items():
                    #if there are accounts to display, we add them to the lines with a level equals to their level in
                    #the COA + 1 (to avoid having them with a too low level that would conflicts with the level of data
                    #financial reports for Assets, liabilities...)
                    flag = False
                    account = self.env['account.account'].browse(account_id)
                    vals = {
                        'name': account.code + ' ' + account.name,
                        'balance': value['balance'] * report.sign or 0.0,
                        'type': 'account',
                        'level': report.display_detail == 'detail_with_hierarchy' and 4,
                        'account_type': account.internal_type,
                        'report_side': report.report_side
                    }
                    if data['debit_credit']:
                        vals['debit'] = value['debit']
                        vals['credit'] = value['credit']
                        if not account.company_id.currency_id.is_zero(vals['debit']) or not account.company_id.currency_id.is_zero(vals['credit']):
                            flag = True
                    if not account.company_id.currency_id.is_zero(vals['balance']):
                        flag = True
                    if data['enable_filter']:
                        vals['balance_cmp'] = value['comp_bal'] * report.sign
                        if not account.company_id.currency_id.is_zero(vals['balance_cmp']):
                            flag = True
                    if flag:
                        sub_lines.append(vals)
                lines += sorted(sub_lines, key=lambda sub_line: sub_line['name'])

        return lines
        
    @api.multi
    def print_excel_report(self):
        self.ensure_one()
        data = {}
        data['ids'] = self.env.context.get('active_ids', [])
        data['model'] = self.env.context.get('active_model', 'ir.ui.menu')
        data['form'] = self.read(['date_from', 'date_to', 'journal_ids', 'target_move', 'company_id'])[0]
        used_context = self._build_contexts(data)
        data['form']['used_context'] = dict(used_context, lang=self.env.context.get('lang', 'en_US'))
        res = self.check_report()
        data['form'].update(self.read(['debit_credit', 'enable_filter', 'label_filter', 'account_report_id', 'date_from_cmp', 'date_to_cmp', 'journal_ids', 'filter_cmp', 'target_move', 'hierarchy_type', 'other_currency'])[0])
#        for field in ['account_report_id']:
#            if isinstance(data['form'][field], tuple):
#                data['form'][field] = data['form'][field][0]
        comparison_context = self._build_comparison_context(data)
        data['form']['comparison_context'] = comparison_context
#        if data['form']['hierarchy_type'] == 'hierarchy':
#            report_lines = self.get_account_lines_hierarchy(data['form'])
#        else:
        report_lines = self.get_account_lines(data['form'])
        print ("\n\n\n\n\nreport_lines",report_lines)
        
        report_name = data['form']['account_report_id'][1]
        total_left, total_left_cmp, total_right, total_right_cmp = 0.00, 0.00, 0.00, 0.00
        
        Style = ExcelStyles()
        wbk = xlwt.Workbook()
        sheet1 = wbk.add_sheet(report_name)
        sheet1.set_panes_frozen(True)
        sheet1.set_horz_split_pos(6)
        sheet1.show_grid = True 
        sheet1.col(0).width = 11000
        sheet1.col(1).width = 5000
        sheet1.col(2).width = 5000
        sheet1.col(3).width = 5000
        sheet1.col(4).width = 1500
        sheet1.col(5).width = 4000
        sheet1.col(6).width = 4000
        sheet1.col(7).width = 4000
        sheet1.col(8).width = 4000
        sheet1.col(9).width = 1000
        sheet1.col(10).width = 4000
        sheet1.col(11).width = 1000
        sheet1.col(12).width = 4000
        sheet1.col(13).width = 4000
        sheet1.col(14).width = 4000
        sheet1.col(15).width = 4000
        r1 = 0
        r2 = 1
        r3 = 2
        r4 = 3
        r5 = 4
        sheet1.row(r1).height = 600
        sheet1.row(r2).height = 600
        sheet1.row(r3).height = 350
        sheet1.row(r4).height = 350 
        sheet1.row(r5).height = 256
        
        title = report_name
#        sheet1.write(r3, 0, "Target Move", Style.subTitle())
#        if data['form']['target_move'] == 'all':
#            sheet1.write(r4, 0, "All Entries", Style.subTitle())
#        if data['form']['target_move'] == 'posted':
#            sheet1.write(r4, 0, "All Posted Entries", Style.subTitle())
#        date_from = date_to = False
#        if data['form']['date_from']:
##            date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
#            date_from = datetime.strftime(data['form']['date_from'], "%d-%m-%Y")
#            sheet1.write(r3, 1, "Date From", Style.subTitle())
#            sheet1.write(r4, 1, date_from, Style.normal_date_alone())
#        else:
#            sheet1.write(r3, 1, "", Style.subTitle())
#            sheet1.write(r4, 1, "", Style.subTitle())
#        if data['form']['date_to']:
##            date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
#            date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
#            sheet1.write(r3, 2, "Date To", Style.subTitle())
#            sheet1.write(r4, 2, date_to, Style.normal_date_alone())
#        else:
#            sheet1.write(r3, 2, "", Style.subTitle())
#            sheet1.write(r4, 2, "", Style.subTitle())
        print ("\n\n\ndata===================data",data)
#        if data['form'].get('right') == True:
#            print ("inside right==========================================")
#            sheet1.write(r3, 3, "Target Move", Style.subTitle())
#            if data['form']['target_move'] == 'all':
#                sheet1.write(r4, 3, "All Entries", Style.subTitle())
#            if data['form']['target_move'] == 'posted':
#                sheet1.write(r4, 3, "All Posted Entries", Style.subTitle())
##            date_from = date_to = False
#            if data['form']['date_from']:
##                date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
##                date_from = datetime.strftime(date_from, "%d-%m-%Y")
#                sheet1.write(r3, 4, "Date From", Style.subTitle())
#                sheet1.write(r4, 4, date_from, Style.normal_date_alone())
#            else:
#                sheet1.write(r3, 4, "", Style.subTitle())
#                sheet1.write(r4, 4, "", Style.subTitle())
#            if data['form']['date_to']:
##                date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
#                date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
#                sheet1.write(r3, 5, "Date To", Style.subTitle())
#                sheet1.write(r4, 5, date_to, Style.normal_date_alone())
#            else:
#                sheet1.write(r3, 5, "", Style.subTitle())
#                sheet1.write(r4, 5, "", Style.subTitle())
        row = r5
        right_row = r5
#        if data['form']['debit_credit'] == True and data['form']['other_currency'] == True:
#            sheet1.write_merge(r1, r1, 0, 6, self.env.user.company_id.name, Style.title_color())
#            sheet1.write_merge(r2, r2, 0, 6, title, Style.sub_title_color())
#            sheet1.write_merge(r3, r3, 3, 6, "", Style.subTitle())
#            sheet1.write_merge(r4, r4, 3, 6, "", Style.subTitle())
#            row = row + 1
#            sheet1.row(row).height = 256 * 3
#            sheet1.write(row, 0, "Account", Style.subTitle_color())
#            sheet1.write(row, 1, "Debit", Style.subTitle_color())
#            sheet1.write(row, 2, "Credit", Style.subTitle_color())
#            sheet1.write(row, 3, "Balance(Tsh)", Style.subTitle_color())
#            sheet1.write(row, 4, "", Style.subTitle_color())
#            sheet1.write(row, 5, "Balance(Other)", Style.subTitle_color())
#            sheet1.write(row, 6, "", Style.subTitle_color())
#            for each in report_lines:
#                if each['level'] != 0:
#                    name = ""
#                    gap = " "
#                    name = each['name']
#                    left = Style.normal_left()
#                    right = Style.normal_num_right_3separator()
#                    if each.get('level') > 3:
#                        gap = " " * (each['level'] * 5)
#                        left = Style.normal_left()
#                        right = Style.normal_num_right_3separator()
#                    if not each.get('level') > 3:
#                        gap = " " * (each['level'] * 5)
#                        left = Style.subTitle_sub_color_left()
#                        right = Style.subTitle_float_sub_color()
#                    if each.get('level') == 1:
#                        gap = " " * each['level']
#                    if each.get('account_type') == 'view':
#                        left = Style.subTitle_sub_color_left()
#                        right = Style.subTitle_float_sub_color()
#                    row = row + 1
#                    sheet1.row(row).height = 400
#                    name = gap + name
#                    sheet1.write(row, 0, name, left)
#                    sheet1.write(row, 1, each['debit'], right)
#                    sheet1.write(row, 2, each['credit'], right)
#                    sheet1.write(row, 3, each['balance'], right)
#                    sheet1.write(row, 4, self.env.user.company_id.currency_id.symbol, left)
#                    if each['currency_symbol']:
#                        sheet1.write(row, 5, each['amount_currency'], right)
#                        sheet1.write(row, 6, each['currency_symbol'], left)
#                    else:
#                        sheet1.write(row, 5, "", right)
#                        sheet1.write(row, 6, "", left)
                        
        if data['form']['debit_credit'] == True:
            
            sheet1.write(r3, 0, "Target Move", Style.subTitle())
            if data['form']['target_move'] == 'all':
                sheet1.write(r4, 0, "All Entries", Style.subTitle())
            if data['form']['target_move'] == 'posted':
                sheet1.write(r4, 0, "All Posted Entries", Style.subTitle())
            date_from = date_to = False
            if data['form']['date_from']:
    #            date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
                date_from = datetime.strftime(data['form']['date_from'], "%d-%m-%Y")
                sheet1.write(r3, 1, "Date From", Style.subTitle())
                sheet1.write(r4, 1, date_from, Style.normal_date_alone())
            else:
                sheet1.write(r3, 1, "", Style.subTitle())
                sheet1.write(r4, 1, "", Style.subTitle())
            if data['form']['date_to']:
    #            date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
                date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
                sheet1.write(r3, 2, "Date To", Style.subTitle())
                sheet1.write(r4, 2, date_to, Style.normal_date_alone())
            else:
                sheet1.write(r3, 2, "", Style.subTitle())
                sheet1.write(r4, 2, "", Style.subTitle())
            if data['form'].get('right') == True:
                print ("inside right==========================================")
                sheet1.write(r3, 4, "Target Move", Style.subTitle())
                if data['form']['target_move'] == 'all':
                    sheet1.write(r4, 4, "All Entries", Style.subTitle())
                if data['form']['target_move'] == 'posted':
                    sheet1.write(r4, 4, "All Posted Entries", Style.subTitle())
    #            date_from = date_to = False
                if data['form']['date_from']:
    #                date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
    #                date_from = datetime.strftime(date_from, "%d-%m-%Y")
                    sheet1.write(r3, 5, "Date From", Style.subTitle())
                    sheet1.write(r4, 5, date_from, Style.normal_date_alone())
                else:
                    sheet1.write(r3, 5, "", Style.subTitle())
                    sheet1.write(r4, 5, "", Style.subTitle())
                if data['form']['date_to']:
    #                date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
                    date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
                    sheet1.write(r3, 6, "Date To", Style.subTitle())
                    sheet1.write(r4, 6, date_to, Style.normal_date_alone())
                else:
                    sheet1.write(r3, 6, "", Style.subTitle())
                    sheet1.write(r4, 6, "", Style.subTitle())
            
            
            sheet1.write_merge(r1, r1, 0, 3, self.env.user.company_id.name, Style.title_color())
            sheet1.write_merge(r2, r2, 0, 3, title, Style.sub_title_color())
            sheet1.write(r3, 3, "", Style.subTitle())
            sheet1.write(r4, 3, "", Style.subTitle())
            row = row + 1
            right_row +=1
            sheet1.row(row).height = 256 * 3
            sheet1.write(row, 0, "Account", Style.subTitle_color())
            sheet1.write(row, 1, "Debit", Style.subTitle_color())
            sheet1.write(row, 2, "Credit", Style.subTitle_color())
            sheet1.write(row, 3, "Balance", Style.subTitle_color())
#            sheet1.write(row, 4, "", Style.subTitle_color())
            if data['form'].get('right'):
                sheet1.write_merge(r1, r1, 4, 7, self.env.user.company_id.name, Style.title_color())
                sheet1.write_merge(r2, r2, 4, 7, title, Style.sub_title_color())
                sheet1.write(r3, 7, "", Style.subTitle())
                sheet1.write(r4, 7, "", Style.subTitle())
                sheet1.write(row, 4, "Account", Style.subTitle_color())
                sheet1.write(row, 5, "Debit", Style.subTitle_color())
                sheet1.write(row, 6, "Credit", Style.subTitle_color())
                sheet1.write(row, 7, "Balance", Style.subTitle_color())
            for each in report_lines:
                if each['level'] != 0:
                    name = ""
                    gap = " "
                    name = each['name']
                    left = Style.normal_left()
                    right = Style.normal_num_right_3separator()
                    if each.get('level') > 3:
                        gap = " " * (each['level'] * 5)
                        left = Style.normal_left()
                        right = Style.normal_num_right_3separator()
                    if not each.get('level') > 3:
                        gap = " " * (each['level'] * 5)
                        left = Style.subTitle_sub_color_left()
                        right = Style.subTitle_float_sub_color()
                    if each.get('level') == 1:
                        gap = " " * each['level']
                    if each.get('account_type') == 'view':
                        left = Style.subTitle_sub_color_left()
                        right = Style.subTitle_float_sub_color()
                    if each['report_side'] != 'right':
                        row = row + 1
                        sheet1.row(row).height = 400
                        name = gap + name
                        sheet1.write(row, 0, name, left)
                        sheet1.write(row, 1, each['debit'], right)
                        sheet1.write(row, 2, each['credit'], right)
                        sheet1.write(row, 3, each['balance'], right)
#                        sheet1.write(row, 4, self.env.user.company_id.currency_id.symbol, left)
                        if each['level'] == 1:
                            total_left += each['balance']
                    elif each['report_side'] == 'right':
                        sheet1.col(4).width = 11000
                        sheet1.col(5).width = 5000
                        sheet1.col(6).width = 5000
                        sheet1.col(7).width = 5000
                        right_row = right_row + 1
                        sheet1.row(right_row).height = 400
                        name = gap + name
                        sheet1.write(right_row, 4, name, left)
                        sheet1.write(right_row, 5, each['debit'], right)
                        sheet1.write(right_row, 6, each['credit'], right)
                        sheet1.write(right_row, 7, each['balance'], right)
                        if each['level'] == 1:
                            total_right += each['balance']
            if data['form'].get('right'):
                if right_row > row:
                    sheet1.write(right_row+1, 0,  'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 1, 3, total_left, Style.groupByTotalNocolor())
                    sheet1.write(right_row+1, 4, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 5, 7, total_right, Style.groupByTotalNocolor())
                else:
                    sheet1.write(row+1, 0, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 1, 3, total_left, Style.groupByTotalNocolor())
                    sheet1.write(row+1, 4, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 5, 7, total_right, Style.groupByTotalNocolor())
            else:
                sheet1.write(row+1, 0, 'Total', Style.groupByTotalNocolor())
                sheet1.write_merge(row+1, row+1, 1, 3, total_left, Style.groupByTotalNocolor())        
            
#        if not data['form']['enable_filter'] and not data['form']['debit_credit'] and data['form']['other_currency'] == True:
#            sheet1.write_merge(r1, r1, 0, 4, self.env.user.company_id.name, Style.title_color())
#            sheet1.write_merge(r2, r2, 0, 4, title, Style.sub_title_color())
#            sheet1.write_merge(r3, r3, 3, 4, "", Style.subTitle())
#            sheet1.write_merge(r4, r4, 3, 4, "", Style.subTitle())
#            row = row + 1
#            sheet1.row(row).height = 256 * 3
#            sheet1.write(row, 0, "Name", Style.subTitle_color())
#            sheet1.write(row, 1, "Balance(Tsh)", Style.subTitle_color())
#            sheet1.write(row, 2, "", Style.subTitle_color())
#            sheet1.write(row, 3, "Balance(Other)", Style.subTitle_color())
#            sheet1.write(row, 4, "", Style.subTitle_color())
#            for each in report_lines:
#                if each['level'] != 0:
#                    name = ""
#                    gap = " "
#                    name = each['name']
#                    left = Style.normal_left()
#                    right = Style.normal_num_right_3separator()
#                    if each.get('level') > 3:
#                        gap = " " * (each['level'] * 5)
#                        left = Style.normal_left()
#                        right = Style.normal_num_right_3separator()
#                    if not each.get('level') > 3:
#                        gap = " " * (each['level'] * 5)
#                        left = Style.subTitle_sub_color_left()
#                        right = Style.subTitle_float_sub_color()
#                    if each.get('level') == 1:
#                        gap = " " * each['level']
#                    if each.get('account_type') == 'view':
#                        left = Style.subTitle_sub_color_left()
#                        right = Style.subTitle_float_sub_color()
#                    row = row + 1
#                    sheet1.row(row).height = 400
#                    name = gap + name
#                    sheet1.write(row, 0, name, left)
#                    sheet1.write(row, 1, each['balance'], right)
#                    sheet1.write(row, 2, self.env.user.company_id.currency_id.symbol, left)
#                    if each['currency_symbol']:
#                        sheet1.write(row, 3, each['amount_currency'], right)
#                        sheet1.write(row, 4, each['currency_symbol'], left)
#                    else:
#                        sheet1.write(row, 3, "", right)
#                        sheet1.write(row, 4, "", left)
                    
        if not data['form']['enable_filter'] and not data['form']['debit_credit']:
            sheet1.write(r3, 0, "Target Move", Style.subTitle())
            if data['form']['target_move'] == 'all':
                sheet1.write(r4, 0, "All Entries", Style.subTitle())
            if data['form']['target_move'] == 'posted':
                sheet1.write(r4, 0, "All Posted Entries", Style.subTitle())
            date_from = date_to = False
            if data['form']['date_from']:
    #            date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
                date_from = datetime.strftime(data['form']['date_from'], "%d-%m-%Y")
                sheet1.write(r3, 1, ("From" + " - "+ date_from), Style.subTitle())
#                sheet1.write(r4, 1, date_from, Style.normal_date_alone())
            else:
                sheet1.write(r3, 1, "", Style.subTitle())
#                sheet1.write(r4, 1, "", Style.subTitle())
            if data['form']['date_to']:
    #            date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
                date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
                sheet1.write(r4, 1, "To" + " - "+ date_to, Style.subTitle())
#                sheet1.write(r4, 2, date_to, Style.normal_date_alone())
            else:
#                sheet1.write(r3, 2, "", Style.subTitle())
                sheet1.write(r4, 1, "", Style.subTitle())
            if data['form'].get('right') == True:
                print ("inside right==========================================")
                sheet1.write(r3, 2, "Target Move", Style.subTitle())
                if data['form']['target_move'] == 'all':
                    sheet1.write(r4, 2, "All Entries", Style.subTitle())
                if data['form']['target_move'] == 'posted':
                    sheet1.write(r4, 2, "All Posted Entries", Style.subTitle())
    #            date_from = date_to = False
                if data['form']['date_from']:
    #                date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
    #                date_from = datetime.strftime(date_from, "%d-%m-%Y")
#                    sheet1.write(r3, 4, "Date From", Style.subTitle())
                    sheet1.write(r3, 3, ("From" + " - "+ date_from), Style.subTitle())
#                    sheet1.write(r4, 4, date_from, Style.normal_date_alone())
                else:
                    sheet1.write(r3, 3, "", Style.subTitle())
#                    sheet1.write(r4, 4, "", Style.subTitle())
                if data['form']['date_to']:
    #                date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
                    date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
#                    sheet1.write(r3, 5, "Date To", Style.subTitle())
                    sheet1.write(r4, 3, ("To" + " - "+ date_to), Style.subTitle())
#                    sheet1.write(r4, 5, date_to, Style.normal_date_alone())
                else:
#                    sheet1.write(r3, 5, "", Style.subTitle())
                    sheet1.write(r4, 3, "", Style.subTitle())
            sheet1.write_merge(r1, r1, 0, 1, self.env.user.company_id.name, Style.title_color())
            sheet1.write_merge(r2, r2, 0, 1, title, Style.sub_title_color())
            if data['form'].get('right'):
                sheet1.write_merge(r1, r1, 2, 3, self.env.user.company_id.name, Style.title_color())
                sheet1.write_merge(r2, r2, 2, 3, title, Style.sub_title_color())
            row = row + 1
            right_row = right_row + 1
            
            sheet1.row(row).height = 256 * 3
            sheet1.write(row, 0, "Name", Style.subTitle_color())
            sheet1.write(row, 1, "Balance", Style.subTitle_color())
#            sheet1.write(row, 2, "", Style.subTitle_color())
            if data['form'].get('right'):
                sheet1.write(row, 2, "Name", Style.subTitle_color())
                sheet1.write(row, 3, "Balance", Style.subTitle_color())
#                sheet1.write(row, 5, "", Style.subTitle_color())
            for each in report_lines:
                if each['level'] != 0:
                    name = ""
                    gap = " "
                    name = each['name']
                    left = Style.normal_left()
                    right = Style.normal_num_right_3separator()
                    if each.get('level') > 3:
                        gap = " " * (each['level'] * 5)
                        left = Style.normal_left()
                        right = Style.normal_num_right_3separator()
                    if not each.get('level') > 3:
                        gap = " " * (each['level'] * 5)
                        left = Style.subTitle_sub_color_left()
                        right = Style.subTitle_float_sub_color()
                    if each.get('level') == 1:
                        gap = " " * each['level']
                    if each.get('account_type') == 'view':
                        left = Style.subTitle_sub_color_left()
                        right = Style.subTitle_float_sub_color()
                    if each['report_side'] != 'right':
                        row = row + 1
                        sheet1.row(row).height = 400
                        name = gap + name
                        sheet1.write(row, 0, name, left)
                        sheet1.write(row, 1, each['balance'], right)
#                        sheet1.write(row, 2, self.env.user.company_id.currency_id.symbol, left)
                        if each['level'] == 1:
                            total_left += each['balance']
                    elif each['report_side'] == 'right':
                        sheet1.col(2).width = 11000
                        sheet1.col(3).width = 5000
#                        sheet1.col(5).width = 5000
                        right_row = right_row + 1
                        sheet1.row(right_row).height = 400
                        name = gap + name
                        sheet1.write(right_row, 2, name, left)
                        sheet1.write(right_row, 3, each['balance'], right)
#                        sheet1.write(right_row, 5, self.env.user.company_id.currency_id.symbol, left)
                        if each['level'] == 1:
                            total_right += each['balance']
            if data['form'].get('right'):
                if right_row > row:
                    sheet1.write(right_row+1, 0,  'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 1, 1, total_left, Style.groupByTotalNocolor())
                    sheet1.write(right_row+1, 2, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 3, 3, total_right, Style.groupByTotalNocolor())
                else:
                    sheet1.write(row+1, 0, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 1, 1, total_left, Style.groupByTotalNocolor())
                    sheet1.write(row+1, 2, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 3, 3, total_right, Style.groupByTotalNocolor())
            else:
                sheet1.write(row+1, 0, 'Total', Style.groupByTotalNocolor())
                sheet1.write_merge(row+1, row+1, 1, 1, total_left, Style.groupByTotalNocolor())
                
#        if data['form']['enable_filter'] and not data['form']['debit_credit'] and data['form']['other_currency'] == True:
#            sheet1.write_merge(r1, r1, 0, 7, self.env.user.company_id.name, Style.title_color())
#            sheet1.write_merge(r2, r2, 0, 7, title, Style.sub_title_color())
#            sheet1.write_merge(r3, r3, 3, 7, "", Style.subTitle())
#            sheet1.write_merge(r4, r4, 3, 7, "", Style.subTitle())
#            row = row + 1
#            sheet1.row(row).height = 256 * 3
#            sheet1.write(row, 0, "Name", Style.subTitle_color())
#            sheet1.write(row, 1, "Balance(Tsh)", Style.subTitle_color())
#            sheet1.write(row, 2, "", Style.subTitle_color())
#            sheet1.write(row, 3, "Balance(Other)", Style.subTitle_color())
#            sheet1.write(row, 4, "", Style.subTitle_color())
#            sheet1.write(row, 5, data['form']['label_filter'] + "(Tsh)", Style.subTitle_color())
#            sheet1.write(row, 6, data['form']['label_filter'] + "(Other)", Style.subTitle_color())
#            sheet1.write(row, 7, "", Style.subTitle_color())
#            for each in report_lines:
#                if each['level'] != 0:
#                    name = ""
#                    gap = " "
#                    name = each['name']
#                    left = Style.normal_left()
#                    right = Style.normal_num_right_3separator()
#                    if each.get('level') > 3:
#                        gap = " " * (each['level'] * 5)
#                        left = Style.normal_left()
#                        right = Style.normal_num_right_3separator()
#                    if not each.get('level') > 3:
#                        gap = " " * (each['level'] * 5)
#                        left = Style.subTitle_sub_color_left()
#                        right = Style.subTitle_float_sub_color()
#                    if each.get('level') == 1:
#                        gap = " " * each['level']
#                    if each.get('account_type') == 'view':
#                        left = Style.subTitle_sub_color_left()
#                        right = Style.subTitle_float_sub_color()
#                    row = row + 1
#                    sheet1.row(row).height = 400
#                    name = gap + name
#                    sheet1.write(row, 0, name, left)
#                    sheet1.write(row, 1, each['balance'], right)
#                    sheet1.write(row, 2, self.env.user.company_id.currency_id.symbol, left)
#                    if each['currency_symbol']:
#                        sheet1.write(row, 3, each['amount_currency'], right)
#                        sheet1.write(row, 4, each['currency_symbol'], left)
#                    else:
#                        sheet1.write(row, 3, "", right)
#                        sheet1.write(row, 4, "", left)
#                    sheet1.write(row, 5, each['balance_cmp'], right)
#                    if each['balance_cmp_currency_symbol']:
#                        sheet1.write(row, 6, each['balance_cmp_amount_currency'], right)
#                        sheet1.write(row, 7, each['balance_cmp_currency_symbol'], left)
#                    else:
#                        sheet1.write(row, 6, "", right)
#                        sheet1.write(row, 7, "", left)
                    
#        if data['form']['enable_filter'] and not data['form']['debit_credit']:
        if data['form']['enable_filter'] and not data['form']['debit_credit']:
            sheet1.write(r3, 0, "Target Move", Style.subTitle())
            if data['form']['target_move'] == 'all':
                sheet1.write(r4, 0, "All Entries", Style.subTitle())
            if data['form']['target_move'] == 'posted':
                sheet1.write(r4, 0, "All Posted Entries", Style.subTitle())
            date_from = date_to = False
            if data['form']['date_from']:
    #            date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
                date_from = datetime.strftime(data['form']['date_from'], "%d-%m-%Y")
                sheet1.write(r3, 1, "Date From", Style.subTitle())
                sheet1.write(r4, 1, date_from, Style.normal_date_alone())
            else:
                sheet1.write(r3, 1, "", Style.subTitle())
                sheet1.write(r4, 1, "", Style.subTitle())
            if data['form']['date_to']:
    #            date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
                date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
                sheet1.write(r3, 2, "Date To", Style.subTitle())
                sheet1.write(r4, 2, date_to, Style.normal_date_alone())
            else:
                sheet1.write(r3, 2, "", Style.subTitle())
                sheet1.write(r4, 2, "", Style.subTitle())
            if data['form'].get('right') == True:
                print ("inside right==========================================")
                sheet1.write(r3, 3, "Target Move", Style.subTitle())
                if data['form']['target_move'] == 'all':
                    sheet1.write(r4, 3, "All Entries", Style.subTitle())
                if data['form']['target_move'] == 'posted':
                    sheet1.write(r4, 3, "All Posted Entries", Style.subTitle())
    #            date_from = date_to = False
                if data['form']['date_from']:
    #                date_from = datetime.strptime(data['form']['date_from'], "%Y-%m-%d")
    #                date_from = datetime.strftime(date_from, "%d-%m-%Y")
                    sheet1.write(r3, 4, "Date From", Style.subTitle())
                    sheet1.write(r4, 4, date_from, Style.normal_date_alone())
                else:
                    sheet1.write(r3, 4, "", Style.subTitle())
                    sheet1.write(r4, 4, "", Style.subTitle())
                if data['form']['date_to']:
    #                date_to = datetime.strptime(data['form']['date_to'], "%Y-%m-%d")
                    date_to = datetime.strftime(data['form']['date_to'], "%d-%m-%Y")
                    sheet1.write(r3, 5, "Date To", Style.subTitle())
                    sheet1.write(r4, 5, date_to, Style.normal_date_alone())
                else:
                    sheet1.write(r3, 5, "", Style.subTitle())
                    sheet1.write(r4, 5, "", Style.subTitle())
        
        
            sheet1.write_merge(r1, r1, 0, 2, self.env.user.company_id.name, Style.title_color())
            sheet1.write_merge(r2, r2, 0, 2, title, Style.sub_title_color())
            if data['form'].get('right') == True:
                sheet1.write_merge(r1, r1, 3, 5, self.env.user.company_id.name, Style.title_color())
                sheet1.write_merge(r2, r2, 3, 5, title, Style.sub_title_color())
#            sheet1.write(r3, 3, "", Style.subTitle())
#            sheet1.write(r4, 3, "", Style.subTitle())
            row = row + 1
            right_row += 1
            sheet1.row(row).height = 256 * 3
            sheet1.write(row, 0, "Name", Style.subTitle_color())
            sheet1.write(row, 1, "Balance", Style.subTitle_color())
#            sheet1.write(row, 2, "", Style.subTitle_color())
            sheet1.write(row, 2, data['form']['label_filter'], Style.subTitle_color())
            if data['form'].get('right'):
                sheet1.col(3).width = 11000
                sheet1.col(4).width = 5000
                sheet1.col(5).width = 5000
                sheet1.write(row, 3, "Name", Style.subTitle_color())
                sheet1.write(row, 4, "Balance", Style.subTitle_color())
                sheet1.write(row, 5, data['form']['label_filter'], Style.subTitle_color())
            for each in report_lines:
                if each['level'] != 0:
                    name = ""
                    gap = " "
                    name = each['name']
                    left = Style.normal_left()
                    right = Style.normal_num_right_3separator()
                    if each.get('level') > 3:
                        gap = " " * (each['level'] * 5)
                        left = Style.normal_left()
                        right = Style.normal_num_right_3separator()
                    if not each.get('level') > 3:
                        gap = " " * (each['level'] * 5)
                        left = Style.subTitle_sub_color_left()
                        right = Style.subTitle_float_sub_color()
                    if each.get('level') == 1:
                        gap = " " * each['level']
                    if each.get('account_type') == 'view':
                        left = Style.subTitle_sub_color_left()
                        right = Style.subTitle_float_sub_color()
                    if each['report_side'] != 'right':
                        row = row + 1
                        sheet1.row(row).height = 400
                        name = gap + name
                        sheet1.write(row, 0, name, left)
                        sheet1.write(row, 1, each['balance'], right)
    #                    sheet1.write(row, 2, self.env.user.company_id.currency_id.symbol, left)
                        sheet1.write(row, 2, each['balance_cmp'], right)
                        if each['level'] == 1:
                            total_left += each['balance']
                            total_left_cmp += each['balance_cmp']
                    elif each['report_side'] == 'right':
                        right_row = right_row + 1
                        sheet1.row(right_row).height = 400
                        name = gap + name
                        sheet1.write(right_row, 3, name, left)
                        sheet1.write(right_row, 4, each['balance'], right)
    #                    sheet1.write(row, 2, self.env.user.company_id.currency_id.symbol, left)
                        sheet1.write(right_row, 5, each['balance_cmp'], right)
                        if each['level'] == 1:
                            total_right += each['balance']
                            total_right_cmp += each['balance_cmp']
            if data['form'].get('right'):
                if right_row > row:
                    sheet1.write(right_row+1, 0,  'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 1, 1, total_left, Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 2, 2, total_left_cmp, Style.groupByTotalNocolor())
                    sheet1.write(right_row+1, 3, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 4, 4, total_right, Style.groupByTotalNocolor())
                    sheet1.write_merge(right_row+1, right_row+1, 5, 5, total_right_cmp, Style.groupByTotalNocolor())
                else:
                    sheet1.write(row+1, 0, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 1, 1, total_left, Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 2, 2, total_left_cmp, Style.groupByTotalNocolor())
                    sheet1.write(row+1, 3, 'Total', Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 4, 4, total_right, Style.groupByTotalNocolor())
                    sheet1.write_merge(row+1, row+1, 5, 5, total_right_cmp, Style.groupByTotalNocolor())
            else:
                sheet1.write(row+1, 0, 'Total', Style.groupByTotalNocolor())
                sheet1.write_merge(row+1, row+1, 1, 1, total_left, Style.groupByTotalNocolor())
                sheet1.write_merge(row+1, row+1, 2, 2, total_left_cmp, Style.groupByTotalNocolor())
                    
        stream = io.BytesIO()
        wbk.save(stream)
        self.env.cr.execute(""" DELETE FROM accounting_report_output""")
#        self.write({'name': report_name + '.xls', 'output': base64.encodestring(stream.getvalue())})
#        return {
#                'name': _('Notification'),
#                'view_type': 'form',
#                'view_mode': 'form',
#                'res_model': 'accounting.report',
#                'res_id': self.id,
#                'type': 'ir.actions.act_window',
#                'target': 'new'
#                }
        attach_id = self.env['accounting.report.output'].create({'name': report_name + '.xls', 'output': base64.encodestring(stream.getvalue())})
        return {
                'name': _('Notification'),
                'view_type': 'form',
                'view_mode': 'form',
                'res_model': 'accounting.report.output',
                'res_id': attach_id.id,
                'type': 'ir.actions.act_window',
                'target': 'new'
                }
        
        
