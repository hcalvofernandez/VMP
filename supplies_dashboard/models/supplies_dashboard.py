# -*- coding: utf-8 -*-

from odoo import models, api

from datetime import datetime, date, timedelta
import pytz
import calendar

def start_end_date_global(start, end, tz):
    tz = pytz.timezone(tz) or 'UTC'
    current_time = datetime.now(tz)
    hour_tz = int(str(current_time)[-5:][:2])
    min_tz = int(str(current_time)[-5:][3:])
    sign = str(current_time)[-6][:1]
    sdate = start + " 00:00:00"
    edate = end + " 23:59:59"
    if sign == '-':
        start_date = (datetime.strptime(sdate, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz,
                                                                                minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
        end_date = (datetime.strptime(edate, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz,
                                                                              minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
    if sign == '+':
        start_date = (datetime.strptime(sdate, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz,
                                                                                minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
        end_date = (datetime.strptime(edate, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz,
                                                                              minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
    return start_date, end_date

class ProductTemplate(models.Model):
    _inherit = "product.template"

    @api.model
    def get_supplies_data(self, start_date, end_date, company_id):
        if company_id:
            company_id = int(company_id)
        else:
            company_id = self.env.user.company_id.id
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start_date, end_date, current_time_zone)

        supplies = self.env['product.template'].with_context(force_company=company_id).search([('es_insumo', '=', True),])
        ids_supplies = supplies.mapped('product_variant_ids.id')
        with_stock = supplies.filtered(lambda s: s.qty_available > 0)

        str_company = str(company_id)
        today_purchase_sql = """SELECT 
                                SUM(pol.price_total) AS today_purchase
                                FROM purchase_order as po
                                INNER JOIN purchase_order_line AS pol ON po.id = pol.order_id
                                WHERE po.date_order >= '%s' 
                                AND po.date_order <= '%s' 
                                AND po.company_id = %s
                                AND po.state IN ('purchase', 'lock')
                                AND pol.product_id IN %s
                            """ % (s_date, e_date, str_company, str(tuple(ids_supplies)))
        self._cr.execute(today_purchase_sql)
        today_purchase_data = self._cr.dictfetchall()

        total_purchase_sql = """SELECT 
                                        SUM(pol.price_total) AS total_purchase
                                        FROM purchase_order as po
                                        INNER JOIN purchase_order_line AS pol ON po.id = pol.order_id
                                        WHERE po.company_id = %s
                                        AND po.state IN ('purchase','lock')
                                        AND pol.product_id IN %s
                                    """ % (str_company, str(tuple(ids_supplies)))
        self._cr.execute(total_purchase_sql)
        total_purchase_data = self._cr.dictfetchall()

        return {
            'with_stock': len(with_stock),
            'today_purchase': self.convert_number(today_purchase_data[0].get('today_purchase') or 0),
            'total_purchase': self.convert_number(total_purchase_data[0].get('total_purchase') or 0),
            'login_user': self.env.user.name,
            'login_user_img': self.env.user.image
        }

    @api.multi
    def convert_number(self, number):
        if number:
            if number < 1000:
                return number
            if number >= 1000 and number < 1000000:
                total = number / 1000
                return str("%.2f" % total) + 'K'
            if number >= 1000000:
                total = number / 1000000
                return str("%.2f" % total) + 'M'
        else:
            return 0

class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.model
    def get_supplies_ids(self, company_id):
        supplies = self.env['product.template'].with_context(force_company=int(company_id)).search(
            [('es_insumo', '=', True), ])
        return str(tuple(supplies.mapped('product_variant_ids.id')))

    @api.model
    def purchase_based_on_hours(self, start, end, company_id):
        res_pos_order = {'total_sales': 0, 'total_orders': 0}
        if company_id:
            pass
        else:
            company_id = self.env.user.company_id.id
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start, end, current_time_zone)
        query = """SELECT extract(hour from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS date_order_hour,
                        SUM(pol.price_total) AS price_total
                        FROM purchase_order_line AS pol
                        LEFT JOIN purchase_order po ON (po.id=pol.order_id)
                        WHERE po.date_order >= '%s'
                        AND po.date_order <= '%s'
                        AND po.company_id = %s
                        AND pol.product_id IN %s
                        GROUP BY extract(hour from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s')
                        ORDER BY price_total DESC
                    """ % (current_time_zone, s_date, e_date, company_id,
                           self.get_supplies_ids(company_id), current_time_zone)

        self._cr.execute(query)
        result_data_hour = self._cr.dictfetchall()
        count = 0
        top_hour_dict = {'top_hour': 0, 'amount': 0.0}
        if result_data_hour:
            for each in result_data_hour:
                if count == 0:
                    top_hour_dict.update(
                        {'top_hour': each.get('date_order_hour'), 'amount': each.get('price_total') or 0.0})
                    count += 1
                    break
        hour_lst = [hrs for hrs in range(0, 24)]
        for each in result_data_hour:
            if each['date_order_hour'] != 23:
                each['date_order_hour'] = [each['date_order_hour'], each['date_order_hour'] + 1]
            else:
                each['date_order_hour'] = [each['date_order_hour'], 0]
            hour_lst.remove(int(each['date_order_hour'][0]))
        for hrs in hour_lst:
            hr = []
            if hrs != 23:
                hr += [hrs, hrs + 1]
            else:
                hr += [hrs, 0]
            result_data_hour.append({'date_order_hour': hr, 'price_total': 0.0})
        sorted_hour_data = sorted(result_data_hour, key=lambda l: l['date_order_hour'][0])
        res_pos_order['purchase_based_on_hours'] = sorted_hour_data
        return {'pos_order': res_pos_order, 'top_hour': top_hour_dict, 'currency': self.env.user.currency_id.symbol}

    @api.model
    def purchase_based_on_current_month(self, start, end, company_id):
        if company_id:
            pass
        else:
            company_id = self.env.user.company_id.id
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start, end, current_time_zone)
        query = """SELECT 
                        extract(day from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS order_day,
                        SUM(pol.price_total) AS price_total
                        FROM purchase_order_line AS pol
                        INNER JOIN purchase_order po ON (po.id=pol.order_id)
                        WHERE 
                        po.date_order >= '%s'
                        AND po.date_order <= '%s'
                        AND po.company_id = %s
                        AND pol.product_id IN %s
                        GROUP BY order_day
                        ORDER BY extract(day from po.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') ASC
                    """ % (current_time_zone, s_date, e_date, company_id,
                           self.get_supplies_ids(company_id), current_time_zone)
        self._cr.execute(query)
        result_data_month = self._cr.dictfetchall()
        final_list = []
        for each in range(1, int(datetime.today().day) + 1):
            total = 0
            for each_1 in result_data_month:
                if each == int(each_1.get('order_day')):
                    total += each_1.get('price_total')
                    break
            final_list.append({'days': each, 'price': total or 0.0})
        return {'final_list': final_list, 'currency': self.env.user.currency_id.symbol}

    @api.model
    def purchase_based_on_current_year(self, start, end, company_id):
        if company_id:
            pass
        else:
            company_id = self.env.user.company_id.id
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start, end, current_time_zone)
        query = """SELECT
                        extract(month from o.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') AS order_month,
                        SUM(pol.price_total) AS price_total
                        FROM purchase_order_line AS pol
                        INNER JOIN purchase_order o ON (o.id=pol.order_id)
                        AND o.date_order >= '%s'
                        AND o.date_order <= '%s'
                        AND o.company_id = %s
                        AND pol.product_id IN %s
                        GROUP BY  order_month
                        ORDER BY extract(month from o.date_order AT TIME ZONE 'UTC' AT TIME ZONE '%s') ASC
                    """ % (current_time_zone, s_date, e_date, company_id,
                           self.get_supplies_ids(company_id), current_time_zone)
        self._cr.execute(query)
        data_year = self._cr.dictfetchall()
        final_list = []
        for each in range(1, int(datetime.today().month) + 1):
            total = 0
            for each_1 in data_year:
                if each == int(each_1.get('order_month')):
                    total += each_1.get('price_total')
                    break
            final_list.append({'order_month': each, 'price_total': total or 0.0})
        for each in final_list:
            each['order_month'] = calendar.month_abbr[int(each['order_month'])]
        return {'final_list': final_list, 'currency': self.env.user.currency_id.symbol}

