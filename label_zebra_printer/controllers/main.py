# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import json
from odoo.http import Controller, route, request


class ReportController(Controller):
    @route([
        '/zebra/report/<converter>/<reportname>',
        '/zebra/report/<converter>/<reportname>/<docids>',
    ], type='json')
    def report_routes_cusrome(self, reportname, docids=None, **data):
        context = dict(request.env.context)
        if docids:
            docids = [int(i) for i in docids.split(',')]
        if data.get('options'):
            data.update(json.loads(data.pop('options')))
        if data.get('context'):
            data['context'] = json.loads(data['context'])
            if data['context'].get('lang'):
                del data['context']['lang']
            context.update(data['context'])
        data = []
        if reportname == 'label_zebra_printer.report_zebra_shipmentlabel':
            for picking in request.env['stock.picking'].browse(docids):
                data.append({
                    'label': picking.name,
                })
        elif reportname == 'stock.report_location_barcode':
            for location in request.env['stock.location'].browse(docids):
                data.append({
                    'name': location.name,
                    'barcode': location.barcode,
                })
        elif reportname == 'product.report_product_label':
            for product in request.env['product.product'].browse(docids):
                data.append({
                    'name': product.name,
                    'barcode': product.barcode,
                })
        else:
            for product in request.env['product.template'].browse(docids):
                data.append({
                    'name': product.name,
                    'barcode': product.barcode,
                })
        return {'data': data}
