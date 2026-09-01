const axios = require('axios');

const cookie = 'hd_ctval=ctval%3DAll%20India; pop_mthd=FL%3D0%7CDTy%3D1; LGNSTR=0%2C2%2C0%2C1%2C1%2C1%2C1%2C0%2C1; im_iss=t%3DeyJhbGciOiJzaGEyNTYiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiI5KjcqNSozKjIqIiwiY2R0IjoiMTAtMDgtMjAyNiIsImV4cCI6MTc4NjQyMDMxNSwiaWF0IjoxNzg2MzMzOTE1LCJpc3MiOiJVU0VSIiwic3ViIjoiMjAyNjI4NjQifQ.lFR4Up8__H4hdTArJvnD0d_xts-VCVhyiHFSQQP_Mxo; ImeshVisitor=SubUser%3D%7Cadmln%3D0%7Cadmsales%3D0%7Ccd%3D10%2FAUG%2F2026%7Ccmid%3D10%7Cctid%3D70490%7Cem%3Dp%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%2A%40gmail.com%7Ceotp%3D%7Cev%3DV%7Cfn%3DGaurav%7Cglid%3D20262864%7Ciso%3DIN%7Cmb1%3D9879533323%7Cphcc%3D91%7Cpkrp%3D0%7Custs%3D%7Cutyp%3DP%7Cuv%3DV; flusrcty=Surat; iploc=gcniso%3DIN%7Cgcnnm%3DIndia%7Cgctnm%3DRajkot%7Cgctid%3D70487%7Cgacrcy%3D100%7Cgip%3D47.11.103.222%7Cgstnm%3DGujarat; userDet=glid%3D20262864%7Cloc_pref%3D2%7Cfcp_flag%3D0%7Cimage%3Dhttp%3A%2F%2F5.imimg.com%2Fdata5%2FSELLER%2FGlPhoto%2F2023%2F1%2FLE%2FBW%2FEB%2F20262864%2Fperatech-11-jpg-64x64.jpg%7Cservice_ids%3D236%2C328%2C374%2C364%2C364%2C359%2C361%2C233%2C280%7Clogo%3Dhttps%3A%2F%2F5.imimg.com%2Fdata5%2FSELLER%2FLogo%2F2025%2F3%2F494890937%2FKD%2FER%2FNO%2F20262864%2Flogo-old-1-90x90.png%7Cpsc_status%3D0%7Cd_re%3D%7Cu_url%3Dhttps%3A%2F%2Fwww.paramengineering.co.in%2F%7Cast%3DA%7Clst%3DLST%7Cctid%3D70490%7Cct%3DSurat%7Cstid%3D6480%7Cst%3DGujarat%7Centerprise%3D0%7Cmod_st%3DF%7Crating%3D4.1%7Cnach%3D0%7Ciec%3D%7Cis_suspect%3D0%7Cvertical%3DKCD%7Cpns_no%3D7942564174%7Cgst%3D24BRAPD4073J1Z2%7Cpan%3DBRAPD4073J%7Ccin%3D%7CcollectPayments%3D0%7Cis_display_invoice_banner%3D0%7Cis_display_enquiry%3D0%7Cis_display_credit%3D0%7Cdisposition%3DI%20don%C3%A2%C2%80%C2%99t%20have%20it%7Cdisp_date%3D02%2F01%2F2026%7CrecreateUserDetCookie%3D%7Cvid%3D%7Cdid%3D%7Cfid%3D%7Csrc_ID%3D2%7ClocPref_enable%3D1%7Ccomp_name%3DParatech%20Industries%7Chosting_date%3D16-Aug-2020%7Cpay_later_navigation%3D0%7Cpre_approved_loan_navigation%3D0%7Ccustom_seller_landing_url_buylead%3Dhttps%253A%252F%252Fseller.indiamart.com%252Fbltxn%252F%253Fpref%253Drecent%7Ccustom_seller_landing_timestamp%3D1786336629140; user_choice_loc=; con_iso=india%3A%3A%3A8; sessid=spv=7; xnHist=pv%3D0%7Cipv%3D45%7Cfpv%3D15%7Ccity%3Dundefined%7Clc_city%3Dundefined%7Ccvstate%3Dundefined%7Cpopupshown%3Dundefined%7Cinstall%3Dundefined%7Css%3Dundefined%7Cmb%3Dundefined%7Ctm%3Dundefined%7Cage%3Dundefined%7Ccount%3D60%7Ctime%3DMon%20Aug%2010%202026%2009%3A21%3A55%20GMT+0530%20%28India%20Standard%20Time%29%7Cglid%3D20262864%7Cgname%3Dundefined%7Cgemail%3Dundefined%7CcityID%3Dundefined; bl_tab_visibility=visible';

async function main() {
  try {
    const res = await axios.post(
      'https://seller.indiamart.com/blreact/contactBuyNow',
      {
        glusrId: '20262864',
        ofrid: '149291709046',
        purchasemod: 'WEB',
        count: 1,
        GRID_PARAMETERS: '1#3 3#7#A#2',
        NIClick: 1,
        bl_page_location: 'page=recent#city=#mcatid=#locpref=',
        grid_lead_pos: 1,
        is_bulk_order: '',
        mapped_mcat_id: '20466',
        matched_mcat_id: '20466',
        ofrtitle: '1610 Mini Laser Engraving Machine CNC with 500mw Laser',
        order_value_flag: '',
        pref: 'https://seller.indiamart.com/bltxn/?pref=recent',
        ptime: '10-08-2026 06:35:14',
        responseTextArea: 0,
        serial: 1,
        tsearch_text: 'all_buyleads',
      },
      {
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          origin: 'https://seller.indiamart.com',
          referer: 'https://seller.indiamart.com/bltxn/?pref=recent',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
          Cookie: cookie,
        },
        validateStatus: () => true,
      }
    );

    console.log('=== contactBuyNow response ===');
    console.log('Status:', res.status, res.statusText);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('Body:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Body:', err.response.data);
    }
  }
}

main();
