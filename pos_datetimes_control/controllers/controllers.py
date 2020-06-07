# -*- coding: utf-8 -*-
from odoo import http

# class PosDatetimesControl(http.Controller):
#     @http.route('/pos_datetimes_control/pos_datetimes_control/', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/pos_datetimes_control/pos_datetimes_control/objects/', auth='public')
#     def list(self, **kw):
#         return http.request.render('pos_datetimes_control.listing', {
#             'root': '/pos_datetimes_control/pos_datetimes_control',
#             'objects': http.request.env['pos_datetimes_control.pos_datetimes_control'].search([]),
#         })

#     @http.route('/pos_datetimes_control/pos_datetimes_control/objects/<model("pos_datetimes_control.pos_datetimes_control"):obj>/', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('pos_datetimes_control.object', {
#             'object': obj
#         })