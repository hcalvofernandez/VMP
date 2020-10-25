# -*- coding: utf-8 -*-

from odoo import models, api, _

from datetime import datetime, timedelta
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
        supplies_with_stock = supplies.filtered(lambda s: s.qty_available > 0)

        str_company = str(company_id)

        today_purchase_sql = """SELECT 
                                SUM(pol.price_total) AS today_purchase
                                FROM purchase_order as po
                                INNER JOIN purchase_order_line AS pol ON po.id = pol.order_id
                                INNER JOIN product_product AS pp ON pp.id = pol.product_id
                                INNER JOIN product_template as pt ON pt.id = pp.product_tmpl_id
                                WHERE po.date_order >= '%s' 
                                AND po.date_order <= '%s' 
                                AND po.company_id = %s
                                AND po.state IN ('purchase', 'lock')
                                AND pt.es_insumo = true
                            """ % (s_date, e_date, str_company)
        self._cr.execute(today_purchase_sql)
        today_purchase_data = self._cr.dictfetchall()

        total_purchase_sql = """SELECT 
                                SUM(pol.price_total) AS total_purchase
                                FROM purchase_order AS po
                                INNER JOIN purchase_order_line AS pol ON po.id = pol.order_id
                                INNER JOIN product_product AS pp ON pp.id = pol.product_id
                                INNER JOIN product_template AS pt ON pt.id = pp.product_tmpl_id
                                WHERE po.company_id = %s
                                AND po.state IN ('purchase','lock')
                                AND pt.es_insumo = true
                                    """ % str_company
        self._cr.execute(total_purchase_sql)
        total_purchase_data = self._cr.dictfetchall()

        today_mrp_order_sql = """SELECT 
                                        SUM(sm.product_qty*ABS(sm.price_unit)) AS today_mrp_order
                                        FROM stock_move AS sm
                                        INNER JOIN mrp_production AS mp ON mp.id = sm.raw_material_production_id
                                        WHERE sm.date >= '%s'
                                        AND sm.date <= '%s'
                                        AND mp.company_id = %s
        """ % (s_date, e_date, str_company)
        self._cr.execute(today_mrp_order_sql)
        today_mrp_order = self._cr.dictfetchall()

        total_mrp_order_sql = """SELECT 
                                        SUM(sm.product_qty * ABS(sm.price_unit)) AS total_mrp_order
                                        FROM stock_move AS sm
                                        INNER JOIN mrp_production AS mp ON mp.id = sm.raw_material_production_id
                                        WHERE mp.company_id = %s
                """ % str_company
        self._cr.execute(total_mrp_order_sql)
        total_mrp_order = self._cr.dictfetchall()

        total_qty_supplies = 0
        total_cost_supplies = 0
        for sup in supplies_with_stock:
            total_qty_supplies += sup.qty_available
            total_cost_supplies += sup.qty_available * sup.standard_price

        return {
            'with_stock': len(supplies_with_stock),
            'today_purchase': self.convert_number(today_purchase_data[0].get('today_purchase') or 0),
            'total_purchase': self.convert_number(total_purchase_data[0].get('total_purchase') or 0),
            'today_mrp_order': self.convert_number(today_mrp_order[0].get('today_mrp_order') or 0),
            'total_mrp_order': self.convert_number(total_mrp_order[0].get('total_mrp_order') or 0),
            'total_qty_supplies': self.convert_number(total_qty_supplies or 0),
            'total_cost_supplies': self.convert_number(total_cost_supplies or 0),
            'login_user': self.env.user.name,
            'login_user_img': self.env.user.image,
            'supplies_data': supplies.read(['id', 'name', 'qty_available'])
        }

    @api.multi
    def convert_number(self, number):
        if number:
            if number < 1000:
                return number
            if 1000 <= number < 1000000:
                total = number / 1000
                return str("%.2f" % total) + 'K'
            if number >= 1000000:
                total = number / 1000000
                return str("%.2f" % total) + 'M'
        else:
            return 0

    @api.model
    def get_available_supplies(self, company_id):
        if company_id:
            company_id = int(company_id)
        else:
            company_id = self.env.user.company_id.id
        supplies = self.env['product.template'].with_context(force_company=company_id).search(
            [('es_insumo', '=', True), ('qty_available', '>', 0)]).read(['id', 'name', 'qty_available', 'uom_id'])
        for sup in supplies:
            sup['uom_id'] = sup['uom_id'][1]
        return {'availables': supplies}

    @api.model
    def data_inventory_cycle(self, product_id, available, start_date, end_date, company_id):
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start_date, end_date, current_time_zone)

        inventory_cycle_sql = """SELECT
            sml.date AS date_time,
            sml.qty_done AS qty,
            spt.code AS type_move
            FROM
            stock_move_line AS sml
            INNER JOIN stock_move AS sm ON sm.id = sml.move_id
            INNER JOIN stock_picking_type AS spt ON spt.id = sm.picking_type_id
            INNER JOIN product_product AS pp ON pp.id = sml.product_id
            WHERE pp.product_tmpl_id = %s
            AND sml.date >= '%s'
            AND sml.date <= '%s'
            AND sm.company_id = %s
        """ % (product_id, s_date, e_date, company_id)

        self._cr.execute(inventory_cycle_sql)
        data = self._cr.dictfetchall()
        data = data.copy()
        available = float(available)
        for i in range(len(data)-1, -1, -1):
            data[i]['stock'] = available
            if data[i]['type_move'] == 'incoming':
                available = available - float(data[i]['qty'])
            else:
                available = available + float(data[i]['qty'])
                data[i]['qty'] *= -1
        data.insert(0, {
            'date_time': _('Previous Stock'),
            'qty': 0,
            'type_move': False,
            'stock': available,
        })

        return {'data': data}



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

    @api.model
    def get_the_top_vendor(self, start, end, company_id):
        if company_id:
            pass
        else:
            company_id = self.env.user.company_id.id
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start, end, current_time_zone)
        sql_query = """SELECT 
                            SUM(pol.qty_received * pol.price_unit) AS amount, 
                            vend.name AS vendor,
                            SUM(pol.qty_received) AS total_product
                            FROM purchase_order_line AS pol
                            INNER JOIN purchase_order AS po ON po.id = pol.order_id
                            INNER JOIN res_partner AS vend ON vend.id = po.partner_id
                            WHERE po.date_order >= '%s'
                            AND po.date_order <= '%s'
                            AND po.company_id = %s
                            AND pol.product_id IN %s
                            AND pol.qty_received > 0
                            GROUP BY vend.name
                            ORDER BY amount DESC LIMIT 10
                        """ % (s_date, e_date, company_id, self.get_supplies_ids(company_id))
        self._cr.execute(sql_query)
        top_vendor = self._cr.dictfetchall()
        return {'top_vendor': top_vendor, 'currency': self.env.user.currency_id.symbol}

    @api.model
    def top_items_by_purchase(self, start, end, company_id):
        if company_id:
            pass
        else:
            company_id = self.env.user.company_id.id
        current_time_zone = self.env.user.tz or 'UTC'
        s_date, e_date = start_end_date_global(start, end, current_time_zone)
        sql_query = """SELECT 
                            SUM(pol.qty_received * pol.price_unit) AS amount, 
                            pt.name AS product_name,
                            SUM(pol.qty_received) AS total_qty
                            FROM purchase_order_line AS pol
                            INNER JOIN purchase_order AS po ON po.id = pol.order_id
                            INNER JOIN product_product AS pp ON pol.product_id=pp.id
                            INNER JOIN product_template AS pt ON pt.id=pp.product_tmpl_id
                            WHERE po.date_order >= '%s'
                            AND po.date_order <= '%s'
                            AND po.company_id = %s
                            AND pt.es_insumo = true
                            AND pol.qty_received > 0
                            GROUP BY product_name
                            ORDER BY amount DESC LIMIT 5
                        """ % (s_date, e_date, company_id)
        self._cr.execute(sql_query)
        result_top_product = self._cr.dictfetchall()
        data_source = []
        count = 0
        for each in result_top_product:
            count += 1
            data_source.append(['<strong>' + str(count) + '</strong>', each.get('product_name'),
                                self.env.user.currency_id.symbol + str("%.2f" % each.get('amount')),
                                each.get('total_qty')])
        return {'data_source': data_source,
                'data_dict': result_top_product}
