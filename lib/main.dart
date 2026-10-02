import 'dart:convert';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'dart:async';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

@JS('wybuildEnablePush')
external JSPromise<JSString> wybuildEnablePush();

void main() => runApp(const WyBuildApp());

class Api {
  final BrowserClient client = BrowserClient()..withCredentials = true;
  Uri u(String path, [Map<String, String>? q]) =>
      Uri(path: path, queryParameters: q);

  Future<dynamic> call(String path, {String method='GET', Map<String,dynamic>? body, Map<String,String>? q}) async {
    final uri = u(path, q);
    http.Response r;
    final headers = {'Accept':'application/json','Content-Type':'application/json'};
    try {
      if (method == 'POST') {
        r = await client.post(uri, headers: headers, body: jsonEncode(body ?? {}));
      } else {
        r = await client.get(uri, headers: {'Accept':'application/json'});
      }
    } on Exception catch (e) {
      throw Exception('Could not reach WyBuild API for $path. Check your internet connection, then retry. Technical detail: $e');
    }
    dynamic data;
    try {
      data = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body);
    } on FormatException catch (e) {
      if (r.statusCode >= 200 && r.statusCode < 300) {
        throw Exception('WyBuild API $path returned HTTP ${r.statusCode}, but its response was not valid JSON. Check the Vercel function logs and deployment version. Parser detail: ${e.message}');
      }
      data = <String, dynamic>{};
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      if (r.statusCode == 401 && path == '/api/auth/me') return {'authenticated':false};
      final payload = data is Map ? data : <String, dynamic>{};
      final serverMessage = payload['error']?.toString();
      final code = payload['code']?.toString();
      final details = payload['details']?.toString();
      final nextStep = payload['nextStep']?.toString();
      final requestId = payload['requestId']?.toString();
      final parts = <String>[];
      if (serverMessage != null && serverMessage.isNotEmpty) parts.add(serverMessage);
      else parts.add('WyBuild API request failed with HTTP ${r.statusCode} at $path.');
      if (code != null && code.isNotEmpty) parts.add('Code: $code.');
      if (details != null && details.isNotEmpty && details != serverMessage) parts.add('GitHub/API detail: $details');
      if (nextStep != null && nextStep.isNotEmpty) parts.add('Next step: $nextStep');
      if (requestId != null && requestId.isNotEmpty) parts.add('Reference: $requestId.');
      parts.add('HTTP ${r.statusCode}.');
      throw Exception(parts.join('\n'));
    }
    return data;
  }
  void login() => web.window.location.assign('/api/auth/github');
  Future<void> logout() async { await call('/api/auth/logout', method:'POST'); }
}

final api = Api();

class WyBuildApp extends StatefulWidget {
  const WyBuildApp({super.key});
  @override State<WyBuildApp> createState() => _WyBuildAppState();
}
class _WyBuildAppState extends State<WyBuildApp> with WidgetsBindingObserver {
  String page = 'home';
  late final JSFunction _popStateHandler;
  static const Set<String> _knownRoutes = {'home','dashboard','projects','builds','releases','docs','features','native-features','devtools','billing','settings','help','privacy','terms'};

  String? _routeFromHash() {
    final raw = web.window.location.hash.replaceFirst('#', '').trim();
    final route = raw.isEmpty ? 'home' : raw;
    return _knownRoutes.contains(route) ? route : null;
  }

  Future<void> _refreshApp() async {
    // Reload the current route; the hash keeps the user on the same page.
    web.window.location.reload();
  }

  void _goBack() {
    if (page != 'home') {
      web.window.history.back();
    } else {
      snack('You are already on the home page.');
    }
  }
  bool drawer = false;
  Map<String,dynamic>? session;
  bool loadingSession = true;
  String sessionLoadError = '';

  final pages = const [
    ('dashboard','Dashboard',Icons.dashboard_outlined),
    ('projects','Projects',Icons.build_circle_outlined),
    ('builds','Builds',Icons.history),
    ('releases','Releases',Icons.rocket_launch_outlined),
    ('docs','Docs & Guide',Icons.menu_book_outlined),
    ('features','Build Features',Icons.auto_awesome_outlined),
    ('devtools','Free Dev Tools',Icons.build_outlined),
    ('billing','Plans',Icons.workspace_premium_outlined),
    ('settings','Settings',Icons.settings_outlined),
    ('help','Help',Icons.help_outline),
    ('privacy','Privacy',Icons.lock_outline),
    ('terms','Terms',Icons.description_outlined),
  ];

  @override void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final initialRoute = _routeFromHash();
    if (initialRoute != null) page = initialRoute;
    _popStateHandler = ((web.Event event) {
      final route = _routeFromHash();
      if (mounted && route != null) setState(() { page = route; drawer = false; });
    }).toJS;
    web.window.addEventListener('popstate', _popStateHandler);
    web.window.history.replaceState(null, '', '#$page');
    loadSession();
  }

  @override void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    web.window.removeEventListener('popstate', _popStateHandler);
    super.dispose();
  }
  Future<void> loadSession() async {
    try {
      final d = await api.call('/api/auth/me');
      if (mounted) setState(() { session = d['authenticated'] == true ? Map<String,dynamic>.from(d) : null; loadingSession=false; });
    } catch (e) { if (mounted) setState(() { loadingSession=false; sessionLoadError='Could not verify your GitHub session. $e'; }); }
  }
  void go(String p) {
    if (!_knownRoutes.contains(p)) return;
    if (p == page) { setState(() => drawer = false); return; }
    web.window.history.pushState(null, '', '#$p');
    setState(() { page=p; drawer=false; });
  }

  @override Widget build(BuildContext context) {
    return MaterialApp(
      title:'WyBuild',
      debugShowCheckedModeBanner:false,
      theme: ThemeData(
        brightness: Brightness.dark, useMaterial3:true,
        scaffoldBackgroundColor: const Color(0xFF090B10),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF635BFF), brightness: Brightness.dark),
        inputDecorationTheme: const InputDecorationTheme(
          filled:true, fillColor: Color(0xFF11151D), border: OutlineInputBorder(),
        ),
        cardTheme: const CardThemeData(color: Color(0xFF10141B), margin: EdgeInsets.zero),
      ),
      home: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF090B10),
          leading: IconButton(icon: const Icon(Icons.menu), onPressed:()=>setState(()=>drawer=!drawer)),
          title: const Text('WYBUILD', style: TextStyle(fontWeight:FontWeight.w800, letterSpacing:1.5)),
          actions:[
            if (page != 'home') IconButton(tooltip:'Back', onPressed:_goBack, icon:const Icon(Icons.arrow_back)),
            IconButton(tooltip:'Refresh page', onPressed:_refreshApp, icon:const Icon(Icons.refresh)),
            if (loadingSession) const Padding(padding:EdgeInsets.all(16), child:SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2)))
            else TextButton.icon(onPressed:session==null?api.login:()=>logout(), icon:Icon(session==null?Icons.login:Icons.account_circle_outlined), label:Text(session==null?'Connect GitHub':'@${session!['user']['login']}'))
          ],
        ),
        body: Column(children:[
          if (sessionLoadError.isNotEmpty) MaterialBanner(
            content: Text(sessionLoadError),
            leading: const Icon(Icons.warning_amber_rounded),
            actions: [TextButton(onPressed: loadSession, child: const Text('Retry')), TextButton(onPressed: () => setState(() => sessionLoadError=''), child: const Text('Dismiss'))],
          ),
          Expanded(child: Row(children:[
            if (drawer || MediaQuery.of(context).size.width >= 900) SizedBox(width:260, child: _sideNav()),
            Expanded(child: RefreshIndicator(onRefresh:_refreshApp, child:_content())),
          ])),
        ]),
      ),
    );
  }
  Widget _sideNav() => Container(
    decoration: const BoxDecoration(border:Border(right:BorderSide(color:Color(0xFF242936)))),
    child: SafeArea(child: Column(crossAxisAlignment:CrossAxisAlignment.stretch, children:[
      const Padding(padding:EdgeInsets.fromLTRB(22,18,22,12), child:Text('DEVELOPER BUILD PLATFORM',style:TextStyle(fontSize:11,color:Colors.white54,letterSpacing:1))),
      Expanded(child: ListView(children:[
        for(final p in pages) ListTile(
          selected: page==p.$1, leading:Icon(p.$3), title:Text(p.$2),
          onTap:()=>go(p.$1),
        ),
      ])),
      Padding(padding:const EdgeInsets.all(16), child: session==null
        ? OutlinedButton.icon(onPressed:api.login, icon:const Icon(Icons.login), label:const Text('Connect GitHub'))
        : Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('@${session!['user']['login']}',style:const TextStyle(fontWeight:FontWeight.bold)),
          TextButton(onPressed:logout,child:const Text('Logout')),
        ])),
      const Padding(padding:EdgeInsets.all(16), child:Text('v1.0.0 • Flutter Web',style:TextStyle(color:Colors.white38,fontSize:12))),
    ]))
  );
  Future<void> logout() async { try { await api.logout(); if(mounted)setState(()=>session=null); } catch(e) { snack(e.toString()); } }
  void snack(String s) { if(!mounted)return; ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(s.replaceFirst('Exception: ','')))); }

  Widget _content() {
    if (page=='home') return Home(onLogin:api.login, go:go);
    switch(page) {
      case 'dashboard': return Dashboard(session:session, go:go);
      case 'projects': return Projects(session:session, onLogin:api.login, snack:snack, go:go);
      case 'builds': return Builds(session:session, onLogin:api.login, snack:snack);
      case 'releases': return Releases(session:session, onLogin:api.login, snack:snack);
      case 'docs': return Docs();
      case 'features': return Features();
      case 'native-features': return NativeFeatures();
      case 'devtools': return DevTools();
      case 'billing': return Billing(session:session, onLogin:api.login, snack:snack);
      case 'settings': return Settings(session:session, onLogin:api.login, snack:snack);
      case 'help': return Help(go:go);
      case 'privacy': return Legal(title:'Privacy', text: privacyText);
      case 'terms': return Legal(title:'Terms of Service', text: termsText);
      default: return Home(onLogin:api.login, go:go);
    }
  }
}

Widget shell(String eyebrow,String title,String sub,Widget child) => SingleChildScrollView(
  physics:const AlwaysScrollableScrollPhysics(),
  padding:const EdgeInsets.all(24),
  child:Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:1100),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(eyebrow,style:const TextStyle(color:Color(0xFF8B93A7),fontSize:11,fontWeight:FontWeight.bold,letterSpacing:1.5)),
    const SizedBox(height:8), Text(title,style:const TextStyle(fontSize:34,fontWeight:FontWeight.w800)),
    if(sub.isNotEmpty) ...[const SizedBox(height:8),Text(sub,style:TextStyle(color:Colors.white60,fontSize:15))],
    const SizedBox(height:22),child,
  ]))));
Widget card(Widget child) => Card(child:Padding(padding:const EdgeInsets.all(18),child:child));
Widget btn(String text, VoidCallback? on, {bool secondary=false, IconData? icon}) =>
  ElevatedButton.icon(onPressed:on, icon:Icon(icon??(secondary?Icons.arrow_forward:Icons.play_arrow)), label:Text(text));
Widget statusChip(String s) {
  final good=s=='success'||s=='completed'; final bad=s=='failure'||s=='cancelled'||s=='timed_out'||s=='startup_failure'||s=='action_required';
  return Chip(label:Text(s),avatar:Icon(good?Icons.check:bad?Icons.close:Icons.hourglass_empty,size:15),backgroundColor:good?Colors.green.withOpacity(.15):bad?Colors.red.withOpacity(.15):Colors.amber.withOpacity(.12));
}

class Home extends StatelessWidget {
  final VoidCallback onLogin; final void Function(String) go;
  const Home({super.key,required this.onLogin,required this.go});
  @override Widget build(BuildContext c)=>shell('WYBUILD / AUTOMATIC ANDROID SHIPPING','Build, fix and ship from GitHub.','WyBuild removes the annoying setup work around Android builds, Gradle, workflows and CI.',Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Your build engineer in a web app.',style:TextStyle(fontSize:24,fontWeight:FontWeight.bold)),
      const SizedBox(height:10),const Text('Connect a repository. WyBuild checks your project before building, sets up a repeatable GitHub Actions workflow, and returns real APK/AAB artifacts. Hosted web apps can be packaged as Trusted Web Activities (TWA), not Android WebViews.'),
      const SizedBox(height:18),Wrap(spacing:10,runSpacing:10,children:[btn('Get Started with GitHub',onLogin,icon:Icons.login),btn('Open Projects',()=>go('projects'),secondary:true,icon:Icons.build)]),
    ])),
    const SizedBox(height:14),
    LayoutBuilder(builder:(c,bc)=>GridView.count(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),crossAxisCount:bc.maxWidth>800?3:1,childAspectRatio:2.2,crossAxisSpacing:12,mainAxisSpacing:12,children:[
      card(const _Mini(title:'Auto project detection',body:'Flutter, Android/Gradle, Vite/React, Node and vanilla HTML.')),
      card(const _Mini(title:'One-tap workflow setup',body:'WyBuild adds the build workflow without asking you to hand-write YAML.')),
      card(const _Mini(title:'Web → Android APK',body:'Static web output can be wrapped into an installable APK automatically.')),
    ])),
  ]));

}
class _Mini extends StatelessWidget { final String title,body; const _Mini({required this.title,required this.body}); @override Widget build(BuildContext c)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(title,style:const TextStyle(fontWeight:FontWeight.bold,fontSize:16)),const SizedBox(height:8),Text(body,style:const TextStyle(color:Colors.white60))]);}

class Dashboard extends StatefulWidget { final Map<String,dynamic>? session; final void Function(String) go; const Dashboard({super.key,this.session,required this.go}); @override State<Dashboard> createState()=>_DashboardState(); }
class _DashboardState extends State<Dashboard>{
 int repos=0,runs=0,success=0; bool loading=true; String error='';
 @override void initState(){super.initState();load();}
 Future<void> load() async {if(widget.session==null){setState(()=>loading=false);return;}try{final rs=await api.call('/api/github/repos');
  // Fetch every repo's runs in parallel instead of one at a time - with N
  // repos this turns N sequential round trips into a single wait for the
  // slowest one. A repo that errors (e.g. Actions disabled) just contributes
  // zero runs instead of failing the whole dashboard.
  final failures=<String>[];
  final results=await Future.wait(rs.map((r)=>api.call('/api/github/runs',q:{'owner':r['owner']['login'],'repo':r['name']}).catchError((e){failures.add('${r['full_name']}: $e');return {'workflow_runs':[]};})));
  int rr=0,ss=0;for(final x in results){for(final w in (x['workflow_runs']??[])){if(w['name']=='WyBuild'){rr++;if(w['conclusion']=='success')ss++;}}}
  if(mounted)setState(() { repos=rs.length; runs=rr; success=ss; loading=false; error=failures.isEmpty?'':'Some repository build histories could not be loaded:\n${failures.join('\n')}'; });}catch(e){if(mounted)setState(() { error='Dashboard could not load repositories or build history. $e'; loading=false; });}}
 @override Widget build(BuildContext c)=>shell('OVERVIEW','Dashboard','Your GitHub-connected build workspace.',loading?const Center(child:CircularProgressIndicator()):Column(children:[
  if(error.isNotEmpty) card(Text(error)),
  Row(children:[Expanded(child:card(_stat('Repositories','$repos'))),const SizedBox(width:12),Expanded(child:card(_stat('WyBuild runs','$runs'))),const SizedBox(width:12),Expanded(child:card(_stat('Successful','$success')))]),
  const SizedBox(height:14),card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('Ready to build?',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),const SizedBox(height:8),const Text('Select a repository and let WyBuild handle the workflow setup.'),const SizedBox(height:14),btn('New Build',()=>widget.go('projects'),icon:Icons.add)]))
 ]));
 Widget _stat(String a,String b)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(a,style:const TextStyle(color:Colors.white54)),const SizedBox(height:8),Text(b,style:const TextStyle(fontSize:28,fontWeight:FontWeight.bold))]);
}

class Projects extends StatefulWidget {
 final Map<String,dynamic>? session; final VoidCallback onLogin; final void Function(String) snack; final void Function(String) go;
 const Projects({super.key,this.session,required this.onLogin,required this.snack,required this.go});
 @override State<Projects> createState()=>_ProjectsState();
}
class _ProjectsState extends State<Projects>{
 List repos=[]; List branches=[]; Map<String,dynamic>? repo; String branch=''; String target='auto'; String twaUrl=''; String twaPackageId='com.example.myapp'; String twaAppName='My App'; bool loading=false,setup=false,checking=false; Map<String,dynamic>? workflow,diagnosis,playReadiness; String error='',message=''; final Map<String,Set<String>> nativeFeaturesByRepo=<String,Set<String>>{};
 Set<String> get selectedNativeFeatures { if(repo==null) return <String>{}; return nativeFeaturesByRepo.putIfAbsent('${repo!['full_name']}',()=> <String>{}); }
 String _nativeFeatureString()=>selectedNativeFeatures.join(',');
 bool get _isTwaTarget=>target=='twaapk'||target=='twaaab';
 final targets={'auto':('APK + AAB • Auto Detect','auto','release'),'debug':('Android APK • Debug','apk','debug'),'apk':('Android APK • Release','apk','release'),'aab':('Android AAB • Play Store','aab','release'),'web':('Web App artifact','web','release'),'twaapk':('Web → Android TWA APK','twa','release'),'twaaab':('Web → Android TWA AAB','twa','release')};
 @override void initState(){super.initState();if(widget.session!=null){loadRepos();}}
 Future<void> loadRepos() async {try{final x=await api.call('/api/github/repos');if(mounted)setState(()=>repos=x);}catch(e){setState(()=>error=e.toString());}}
 Future<void> selectRepo(dynamic r) async {setState(() { repo=Map<String,dynamic>.from(r); branches=[]; branch=''; workflow=null; diagnosis=null; playReadiness=null; });try{final b=await api.call('/api/github/branches',q:{'owner':r['owner']['login'],'repo':r['name']});if(mounted)setState(() { branches=b; branch=r['default_branch']; });await diagnose();}catch(e){setState(()=>error=e.toString());}}
 Future<void> diagnose() async {if(repo==null||branch.isEmpty)return;setState(()=>checking=true);try{final d=await api.call('/api/github/diagnose',q:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch});if(mounted)setState(()=>diagnosis=Map<String,dynamic>.from(d));}catch(e){if(mounted)setState(()=>error='Project Doctor could not inspect ${repo!['full_name'] ?? repo!['name']} on branch $branch. $e');}finally{if(mounted)setState(()=>checking=false);}}
 Future<void> check() async {if(repo==null)return;setState(()=>checking=true);try{final d=await api.call('/api/github/workflow',q:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch});setState(()=>workflow=d);}catch(e){setState(()=>error=e.toString());}finally{setState(()=>checking=false);}}
 Future<void> checkPlayReadiness() async {if(repo==null||branch.isEmpty)return;setState(()=>checking=true);try{final d=await api.call('/api/github/play-readiness',q:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch,'target':target});if(mounted)setState(()=>playReadiness=Map<String,dynamic>.from(d));}catch(e){if(mounted)setState(()=>error='Play Store readiness check failed: $e');}finally{if(mounted)setState(()=>checking=false);}}
 Future<void> install() async {if(repo==null)return;setState(()=>setup=true);try{final d=await api.call('/api/github/install-workflow',method:'POST',body:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch});setState(()=>message='${d['message']??'Workflow setup complete.'} ${d['notificationsConfigured']==true?'Build push callback is configured.':'Push callback setup could not be confirmed; check GitHub Actions secret permissions and Firebase setup.'}');await check();}catch(e){setState(()=>error=e.toString());}finally{setState(()=>setup=false);}}
 Widget _nativeFeatureSelector() {
   final selectedCount=selectedNativeFeatures.length;
   return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     PopupMenuButton<String>(
       enabled:_isTwaTarget,
       tooltip:'Select features for this project build',
       onSelected:(key)=>setState(() { if(selectedNativeFeatures.contains(key)){selectedNativeFeatures.remove(key);}else{selectedNativeFeatures.add(key);} }),
       itemBuilder:(context)=>nativeFeatureCatalog.where((f)=>f.key!='INTERNET').map((f)=>PopupMenuItem<String>(
         value:f.key,height:68,
         child:Row(children:[
           Icon(selectedNativeFeatures.contains(f.key)?Icons.check_box:Icons.check_box_outline_blank,size:20,color:selectedNativeFeatures.contains(f.key)?Colors.deepPurpleAccent:Colors.white54),
           const SizedBox(width:10),
           Expanded(child:Column(mainAxisAlignment:MainAxisAlignment.center,crossAxisAlignment:CrossAxisAlignment.start,children:[
             Text('${f.title}${f.tier=='PRO'?' • PRO':''}',style:TextStyle(fontWeight:FontWeight.w600,color:f.tier=='PRO'?Colors.amber:Colors.white)),
             Text(f.short,maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:11,color:Colors.white60)),
           ])),
         ]),
       )).toList(),
       child:Container(width:double.infinity,padding:const EdgeInsets.symmetric(horizontal:14,vertical:14),decoration:BoxDecoration(color:const Color(0xFF11151D),border:Border.all(color:const Color(0xFF3A4050)),borderRadius:BorderRadius.circular(8)),child:Row(children:[
         const Icon(Icons.extension_outlined),const SizedBox(width:10),Expanded(child:Text('Native features & gestures ($selectedCount selected)',style:const TextStyle(fontWeight:FontWeight.w600))),const Icon(Icons.arrow_drop_down),
       ])),
     ),
     const SizedBox(height:6),
     Text(_isTwaTarget
       ?'Selections are applied where the TWA wrapper supports them. Camera, location, notifications and deep-link settings configure Android metadata; browser features still require the website/PWA to implement the corresponding web API. A TWA cannot inject a native JavaScript bridge into Chrome.'
       :'Choose a Web → Android TWA APK/AAB target to configure these options. Existing Flutter/Gradle apps are built from their own source and are not rewritten by these switches.',
       style:const TextStyle(color:Colors.white54,fontSize:12)),
     if(selectedNativeFeatures.isNotEmpty) Padding(padding:const EdgeInsets.only(top:6),child:Text('Selected: ${selectedNativeFeatures.map(featureTitle).join(', ')}',style:const TextStyle(color:Colors.white70,fontSize:12))),
   ]);
 }

 Future<void> doBuild() async {
    if(repo==null||branch.isEmpty)return;
    if(selectedNativeFeatures.isNotEmpty && !_isTwaTarget){setState(()=>error='Native feature selections apply only to generated TWA builds. Choose a TWA APK/AAB target or clear the selections before building another target.');return;}
    final t=targets[target]!;
    if(target=='twaapk'||target=='twaaab'){final uri=Uri.tryParse(twaUrl.trim()); if(uri==null||uri.scheme!='https'||uri.host.isEmpty){setState(()=>error='TWA requires your deployed HTTPS website URL.');return;} if(!RegExp(r'^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$').hasMatch(twaPackageId.trim())){setState(()=>error='Enter a valid Android package ID, e.g. com.example.myapp.');return;} if(twaAppName.trim().isEmpty){setState(()=>error='Enter an app name.');return;}}
    setState(()=>loading=true);
    try{
      final status=await api.call('/api/github/workflow',q:{
        'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch
      });
      if(status['dispatchable']!=true||status['upToDate']!=true){
        final installed=await api.call('/api/github/install-workflow',method:'POST',body:{
          'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch
        });
        if(installed['merged']!=true){
          throw Exception(installed['message']??'Workflow setup needs to be completed before building.');
        }
        await Future<void>.delayed(const Duration(seconds:2));
      }
      await api.call('/api/github/dispatch',method:'POST',body:{
        'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch,
        'inputs':{'build_type':t.$2,'build_mode':t.$3,'native_features':_nativeFeatureString(),'web_app_url':twaUrl.trim(),'app_id':twaPackageId.trim(),'app_name':twaAppName.trim(),'twa_output':target=='twaaab'?'aab':'apk'}
      });
      setState(()=>message='Build queued in GitHub Actions. Open Builds to monitor it.');
    }catch(e){setState(()=>error=e.toString());}
    finally{setState(()=>loading=false);}
  }
 @override Widget build(BuildContext c){
  if(widget.session==null)return shell('WORKSPACE','Projects','Connect GitHub to let WyBuild inspect repositories and install workflows.',card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('GitHub connection required',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),const SizedBox(height:8),const Text('WyBuild uses GitHub authorization instead of asking you to paste a personal access token.'),const SizedBox(height:14),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));
  return shell('WORKSPACE','Projects','Pick a repository. WyBuild diagnoses it, installs/updates the workflow, then builds APK + AAB automatically for Flutter/Gradle projects.',Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   if(error.isNotEmpty) _notice(error,true),
   if(message.isNotEmpty) _notice(message,false),
   card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    const Text('1. Select project',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),const SizedBox(height:12),
    DropdownButtonFormField<dynamic>(value:repo,decoration:const InputDecoration(labelText:'GitHub repository'),items:repos.map((r)=>DropdownMenuItem(value:r,child:Text(r['full_name']))).toList(),onChanged:(r){if(r!=null)selectRepo(r);}),
    if(repo!=null) ...[const SizedBox(height:12),DropdownButtonFormField<String>(value:branch.isEmpty?null:branch,decoration:const InputDecoration(labelText:'Branch'),items:branches.map((b)=>DropdownMenuItem(value:b['name'] as String,child:Text(b['name']))).toList(),onChanged:(v){if(v!=null){setState(() {branch=v;playReadiness=null;});diagnose();}},)],
   ])),
   if(repo!=null) ...[
    const SizedBox(height:12),
    card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('2. Project Doctor',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),const SizedBox(height:8),
      const Text('Checks your repository markers and tells WyBuild which build path fits best.'),
      const SizedBox(height:12),
      if(checking) const LinearProgressIndicator(),
      if(diagnosis!=null) _diagnosis(diagnosis!),
      const SizedBox(height:10),btn('Check Workflow',check,secondary:true,icon:Icons.fact_check_outlined),
      if(workflow!=null) ...[const SizedBox(height:12),Text('Workflow: ${workflow!['exists']==true?'installed':'not installed'} • ${workflow!['upToDate']==false?'update available':'current'}'),const SizedBox(height:10),
        btn((workflow!['dispatchable']==true&&workflow!['upToDate']!=false)?'Workflow ready':'Install / update workflow',(workflow!['dispatchable']==true&&workflow!['upToDate']!=false)?null:install,icon:Icons.settings_suggest),
      ],
    ])),
    const SizedBox(height:12),
    card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('3. Build target',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),const SizedBox(height:12),
      DropdownButtonFormField<String>(value:target,decoration:const InputDecoration(labelText:'What do you want?'),items:targets.entries.map((e)=>DropdownMenuItem(value:e.key,child:Text(e.value.$1))).toList(),onChanged:(v)=>setState(() {target=v??'auto';playReadiness=null;})),
      const SizedBox(height:12),
      const Text('4. Native features & gestures',style:TextStyle(fontSize:17,fontWeight:FontWeight.bold)),
      const SizedBox(height:8),
      _nativeFeatureSelector(),
      if(target=='twaapk'||target=='twaaab') ...[
        const Text('Trusted Web Activity setup',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),
        const SizedBox(height:8),
        const Text('TWA loads your deployed HTTPS PWA in Chrome without embedding a WebView. Your site must have a valid web manifest and Digital Asset Links. For a test APK, the site association must match the APK signing certificate; for a Play AAB, it must match the Google Play app-signing certificate. WyBuild checks the HTTPS URL, web manifest, signing key and Digital Asset Links before building.',style:TextStyle(color:Colors.white70)),
        const SizedBox(height:12),
        TextField(decoration:const InputDecoration(labelText:'Deployed HTTPS website URL',hintText:'https://app.example.com'),keyboardType:TextInputType.url,onChanged:(v)=>twaUrl=v),
        const SizedBox(height:10),
        TextFormField(initialValue:'com.example.myapp',decoration:const InputDecoration(labelText:'Android package ID',hintText:'com.example.myapp'),onChanged:(v)=>twaPackageId=v),
        const SizedBox(height:10),
        TextFormField(initialValue:'My App',decoration:const InputDecoration(labelText:'App display name'),onChanged:(v)=>twaAppName=v),
      ],
      const SizedBox(height:12),
      if(target=='web') const Text('Web output is not an Android app. For a no-WebView Android app, deploy your PWA over HTTPS and select a TWA target.',style:TextStyle(color:Colors.white70)),
      const SizedBox(height:12),
      card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Row(children:[Icon(Icons.verified_user_outlined),SizedBox(width:8),Expanded(child:Text('5. Play Store Readiness Check',style:TextStyle(fontSize:17,fontWeight:FontWeight.bold)))]),
        const SizedBox(height:6),
        const Text('Static checks for target SDK, signing, versioning, manifests, dependency locks and Play Console tasks. This is a preflight—not a Google approval guarantee.',style:TextStyle(color:Colors.white70)),
        const SizedBox(height:10),
        btn(checking?'Checking…':'Run Play Store Readiness Check',checking?null:checkPlayReadiness,secondary:true,icon:Icons.fact_check_outlined),
        if(playReadiness!=null) ...[
          const SizedBox(height:10),
          Container(width:double.infinity,padding:const EdgeInsets.all(12),decoration:BoxDecoration(color:((playReadiness!['status']=='blocked')?Colors.red:playReadiness!['status']=='review'?Colors.orange:Colors.green).withOpacity(.12),borderRadius:BorderRadius.circular(10)),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(playReadiness!['status']=='blocked'?'BLOCKED':playReadiness!['status']=='review'?'NEEDS REVIEW':'READY FOR MANUAL REVIEW',style:const TextStyle(fontWeight:FontWeight.bold)),
            const SizedBox(height:5),Text('${playReadiness!['summary']??''}'),
          ])),
          const SizedBox(height:8),
          for(final item in (playReadiness!['checks']??[])) Padding(padding:const EdgeInsets.only(bottom:8),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(item['status']=='pass'?Icons.check_circle:item['status']=='fail'?Icons.error_outline:item['status']=='manual'?Icons.fact_check_outlined:Icons.warning_amber_rounded,color:item['status']=='pass'?Colors.green:item['status']=='fail'?Colors.red:item['status']=='manual'?Colors.lightBlue:Colors.orange,size:18),const SizedBox(width:8),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${item['label']}',style:const TextStyle(fontWeight:FontWeight.w600)),Text('${item['detail']??''}',style:const TextStyle(color:Colors.white60,fontSize:12))]))])),
        ],
      ])),
      const SizedBox(height:12),btn(loading?'Building…':'Build Now',loading?null:doBuild,icon:Icons.rocket_launch),
    ])),
   ]
  ]));
 }
 Widget _notice(String s,bool bad)=>Container(width:double.infinity,margin:const EdgeInsets.only(bottom:12),padding:const EdgeInsets.all(14),decoration:BoxDecoration(color:(bad?Colors.red:Colors.green).withOpacity(.12),borderRadius:BorderRadius.circular(10)),child:Text(s.replaceFirst(RegExp(r'^(Exception|FormatException): '),''), softWrap:true));
 Widget _diagnosis(Map d)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
  Text('Detected: ${d['type']??'unknown'}',style:const TextStyle(fontWeight:FontWeight.bold)),
  const SizedBox(height:8),
  for(final x in (d['checks']??[])) Row(children:[Icon(x['ok']==true?Icons.check_circle:Icons.radio_button_unchecked,color:x['ok']==true?Colors.green:Colors.white38,size:18),const SizedBox(width:8),Expanded(child:Text('${x['label']}'))]),
  if(d['recommendation']!=null) ...[const SizedBox(height:8),Text('Recommended: ${d['recommendation']}',style:const TextStyle(color:Colors.white70))],
 ]);
}

class Builds extends StatefulWidget {final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Builds({super.key,this.session,required this.onLogin,required this.snack});@override State<Builds> createState()=>_BuildsState();}
class _BuildsState extends State<Builds>{List runs=[];bool loading=true;String error='';Timer? timer;@override void initState(){super.initState();load();timer=Timer.periodic(const Duration(seconds:15),(_){if(mounted&&!loading)load();});} @override void dispose(){timer?.cancel();super.dispose();}
Future<void> load()async{if(widget.session==null){setState(()=>loading=false);return;}try{final rs=await api.call('/api/github/repos');
  // Query every repo in parallel so newly dispatched runs appear quickly.
  // The API endpoint is already scoped to wybuild.yml, so do not discard
  // runs based on the workflow display name.
  final failures=<String>[];
  final results=await Future.wait(rs.map((r)=>api.call('/api/github/runs',q:{'owner':r['owner']['login'],'repo':r['name']}).then((x)=>{'repo':r,'data':x}).catchError((_) { failures.add('${r['full_name']}: $_'); return {'repo':r,'data':{'workflow_runs':[]}}; })));
  final out=[];for(final res in results){final r=res['repo'];final x=res['data'];for(final w in (x['workflow_runs']??[])){out.add({...w,'repo':r['full_name'],'repoName':r['name'],'owner':r['owner']['login']});}}
  out.sort((a,b)=>DateTime.parse(b['created_at']).compareTo(DateTime.parse(a['created_at'])));if(mounted)setState(() { runs=out.take(100).toList(); loading=false; error=failures.isEmpty?'':'Build history could not be loaded for these repositories:\n${failures.join('\n')}'; });}catch(e){if(mounted)setState(() { error=e.toString(); loading=false; });}}
@override Widget build(BuildContext c){if(widget.session==null)return shell('HISTORY','Builds','Real GitHub Actions history.',card(Column(children:[const Text('Connect GitHub first'),const SizedBox(height:8),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));return shell('HISTORY','Builds','Showing WyBuild runs across your accessible repositories.',Column(children:[
  // Poll lightly while Builds is open so queued/in-progress runs appear
  // automatically. The explicit refresh button remains available.
  Align(alignment:Alignment.centerRight,child:btn(loading?'Refreshing…':'Refresh list',loading?null:load,secondary:true,icon:Icons.refresh)),
  const SizedBox(height:12),
  if(loading)const CircularProgressIndicator(),if(error.isNotEmpty)_notice(error),if(!loading&&runs.isEmpty)card(const Text('No WyBuild runs found. Start a build from Projects.')),for(final r in runs)RunCard(run:r,onRefresh:load,snack:widget.snack)]));}
Widget _notice(String s)=>Padding(padding:const EdgeInsets.only(bottom:12),child:card(Text(s.replaceFirst('Exception: ',''))));
}

class RunCard extends StatefulWidget{final dynamic run;final Future<void> Function() onRefresh;final void Function(String) snack;const RunCard({super.key,required this.run,required this.onRefresh,required this.snack});@override State<RunCard> createState()=>_RunCardState();}
class _RunCardState extends State<RunCard>{dynamic detail;bool busy=false;List artifactList=[];bool artifactsChecked=false;String artifactError='';bool diagnosing=false;Map<String,dynamic>? failureDiagnosis;bool get hasFailure=>const ['failure','timed_out','startup_failure','action_required'].contains(detail?['conclusion']);
@override void initState(){super.initState();detail=widget.run;_maybeLoadArtifacts();}
void _maybeLoadArtifacts(){if(detail['conclusion']=='success')_loadArtifacts();}
// Fetched once up front (instead of only on click) so the correct
// APK/AAB/Web button can be shown immediately and tapping it downloads
// straight away with no extra round trip.
Future<void> _loadArtifacts()async{try{final d=await api.call('/api/github/artifacts',q:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});if(mounted)setState((){artifactList=(d['artifacts']??[]) as List;artifactsChecked=true;artifactError=artifactList.isEmpty?'Build succeeded, but GitHub returned no downloadable artifacts for this run. Check the Upload APK/AAB/Web output step in the workflow logs.':'';});}catch(e){if(mounted)setState((){artifactsChecked=true;artifactError='Could not load build artifacts. $e';});}}
Future<void> refresh()async{setState(()=>busy=true);try{detail=await api.call('/api/github/run',q:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});artifactList=[];artifactsChecked=false;setState((){});_maybeLoadArtifacts();}catch(e){widget.snack(e.toString());}finally{setState(()=>busy=false);}}
Future<void> diagnoseFailure()async{setState(()=>diagnosing=true);try{final d=await api.call('/api/github/diagnose-run',q:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});if(mounted)setState(()=>failureDiagnosis=Map<String,dynamic>.from(d));}catch(e){widget.snack('Could not diagnose this build. $e');}finally{if(mounted)setState(()=>diagnosing=false);}}
Future<void> rerun()async{try{await api.call('/api/github/rerun',method:'POST',body:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});await refresh();}catch(e){widget.snack(e.toString());}}
Future<void> rebuildCurrent()async{
  try{
    final title='${detail['display_title']??detail['name']??''}';
    if(RegExp(r'WyBuild:\s*twa\b').hasMatch(title)){widget.snack('To rebuild this TWA, return to Projects and re-enter its website URL, package ID and app name.');return;}
    final typeMatch=RegExp(r'WyBuild:\s*(auto|apk|aab|web)').firstMatch(title);
    final modeMatch=RegExp(r'\((debug|release)\)').firstMatch(title);
    final featureMatch=RegExp(r'\[([^\]]+)\]').firstMatch(title);
    final features=featureMatch?.group(1)??'free';
    await api.call('/api/github/rebuild',method:'POST',body:{
      'owner':widget.run['owner'],'repo':widget.run['repoName'],
      'ref':detail['head_branch']??widget.run['head_branch']??'main',
      'build_type':typeMatch?.group(1)??'apk',
      'build_mode':modeMatch?.group(1)??'release',
      'native_features':features
    });
    widget.snack('Rebuild queued from the current branch.');
    await widget.onRefresh();
  }catch(e){widget.snack(e.toString());}
}
Widget _artifactButton(dynamic a){final n='${a['name']}';final isWeb=n.toLowerCase().contains('web');return btn(isWeb?'Download Web Build':'Download $n',()=>web.window.location.assign('/api/github/artifact?owner=${widget.run['owner']}&repo=${widget.run['repoName']}&id=${a['id']}'));}
Future<void> artifacts()async{try{final d=await api.call('/api/github/artifacts',q:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});showDialog(context:context,builder:(_)=>AlertDialog(title:const Text('Artifacts'),content:SizedBox(width:400,child:Wrap(spacing:8,runSpacing:8,children:[for(final a in (d['artifacts']??[]) as List)_artifactButton(a)]))));}catch(e){widget.snack(e.toString());}}
void _download(dynamic a)=>web.window.location.assign('/api/github/artifact?owner=${widget.run['owner']}&repo=${widget.run['repoName']}&id=${a['id']}');
// One button per artifact kind actually produced by this run (an 'auto'
// build on a web project can yield both an APK and a web bundle), each
// correctly labeled instead of a single button that always said "Download
// APK" even when the run had produced an AAB or a web bundle.
List<Widget> _downloadButtons(){
 dynamic find(String needle)=>artifactList.cast<dynamic>().firstWhere((a)=>'${a['name']}'.toLowerCase().contains(needle),orElse:()=>null);
 final apk=find('apk'),aab=find('aab'),web=find('web');
 final out=<Widget>[];
 if(apk!=null)out.add(btn('Download APK',()=>_download(apk),icon:Icons.android));
 if(aab!=null)out.add(btn('Download AAB',()=>_download(aab),icon:Icons.inventory_2_outlined));
 if(web!=null)out.add(btn('Download Web Build',()=>_download(web),icon:Icons.public));
 return out;
}
@override Widget build(BuildContext c) {
  final diagnosis = failureDiagnosis;
  final failedSteps = (diagnosis?['failedSteps'] as List?) ?? const [];
  final excerpts = (diagnosis?['excerpts'] as List?) ?? const [];
  return Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: card(Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(child: Text('${detail['name']} • ${widget.run['repo']}', style: const TextStyle(fontWeight: FontWeight.bold))),
          statusChip('${detail['conclusion'] ?? detail['status']}'),
        ]),
        const SizedBox(height: 7),
        Text(DateTime.parse(detail['created_at']).toLocal().toString(), style: const TextStyle(color: Colors.white54)),
        if (artifactError.isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 8, bottom: 8), child: Text(artifactError, style: const TextStyle(color: Colors.orangeAccent))),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (detail['conclusion'] == 'success' && !artifactsChecked)
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          ..._downloadButtons(),
          btn('Rebuild', rebuildCurrent, secondary: true, icon: Icons.replay),
          btn(busy ? 'Refreshing…' : 'Refresh', busy ? null : refresh, secondary: true, icon: Icons.refresh),
          if (hasFailure)
            btn(diagnosing ? 'Diagnosing…' : 'Diagnose failure', diagnosing ? null : diagnoseFailure, secondary: true, icon: Icons.manage_search),
          if (hasFailure) btn('Retry same run', rerun, secondary: true, icon: Icons.restart_alt),
          btn('Artifacts', artifacts, secondary: true, icon: Icons.download),
          btn('Logs', () => web.window.location.assign('/api/github/logs?owner=${widget.run['owner']}&repo=${widget.run['repoName']}&id=${widget.run['id']}'), secondary: true, icon: Icons.list_alt),
          if (detail['html_url'] != null) btn('GitHub', () => web.window.location.assign(detail['html_url']), secondary: true, icon: Icons.open_in_new),
        ]),
        if (diagnosis != null) ...[
          const SizedBox(height: 12),
          card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Build failure diagnosis', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 6),
            Text('${diagnosis['summary'] ?? ''}'),
            if (failedSteps.isEmpty && diagnosis['logArchiveMessage'] != null)
              Text('GitHub log archive detail: ${diagnosis['logArchiveMessage']}'),
            for (final f in excerpts)
              Padding(padding: const EdgeInsets.only(top: 10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${f['job']} → ${f['step']}', style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.orangeAccent)),
                const SizedBox(height: 4),
                SelectableText('${f['excerpt'] ?? 'No matching log excerpt was available. Open Logs for the complete archive.'}', style: const TextStyle(fontFamily: 'monospace', fontSize: 11)),
              ])),
            if (failedSteps.isNotEmpty && excerpts.isEmpty)
              const Text('GitHub identified a failed step, but its log file could not be matched automatically. Use Logs to download the full archive or GitHub to inspect the run.'),
          ])),
        ],
      ],
    )),
  );
}
}

class Releases extends StatefulWidget{final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Releases({super.key,this.session,required this.onLogin,required this.snack});@override State<Releases> createState()=>_ReleasesState();}
class _ReleasesState extends State<Releases>{List repos=[];String repo='';String tag='',name='',notes='';bool pre=false,loading=false;List releases=[];@override void initState(){super.initState();load();}Future<void>load()async{if(widget.session==null)return;try{repos=await api.call('/api/github/repos');setState((){});}catch(e){widget.snack(e.toString());}}Future<void>get()async{if(repo.isEmpty)return;final p=repo.split('/');try{releases=await api.call('/api/github/releases',q:{'owner':p[0],'repo':p[1]});setState((){});}catch(e){widget.snack(e.toString());}}
Future<void>create()async{if(repo.isEmpty||tag.trim().isEmpty)return;setState(()=>loading=true);try{final p=repo.split('/');await api.call('/api/github/releases',method:'POST',body:{'owner':p[0],'repo':p[1],'tag_name':tag.trim(),'name':name.trim().isEmpty?tag.trim():name.trim(),'body':notes.trim(),'prerelease':pre,'draft':false,'generate_release_notes':notes.trim().isEmpty});tag='';name='';notes='';await get();}catch(e){widget.snack(e.toString());}finally{setState(()=>loading=false);}}
@override Widget build(BuildContext c){if(widget.session==null)return shell('SHIP','Releases','Create real GitHub Releases.',card(Column(children:[const Text('Connect GitHub first'),const SizedBox(height:8),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));return shell('SHIP','Releases','Publish a version after a successful build.',Column(children:[card(Column(children:[DropdownButtonFormField<String>(value:repo.isEmpty?null:repo,decoration:const InputDecoration(labelText:'Repository'),items:repos.map((r)=>DropdownMenuItem(value:r['full_name'] as String,child:Text(r['full_name']))).toList(),onChanged:(v){repo=v??'';get();}),const SizedBox(height:10),TextField(decoration:const InputDecoration(labelText:'Tag name',hintText:'v1.0.0'),onChanged:(v)=>tag=v),const SizedBox(height:10),TextField(decoration:const InputDecoration(labelText:'Release name'),onChanged:(v)=>name=v),const SizedBox(height:10),TextField(minLines:4,maxLines:7,decoration:const InputDecoration(labelText:'Release notes'),onChanged:(v)=>notes=v),const SizedBox(height:10),SwitchListTile(title:const Text('Pre-release'),value:pre,onChanged:(v)=>setState(()=>pre=v)),btn(loading?'Creating…':'Create GitHub Release',loading?null:create,icon:Icons.rocket_launch)])),if(releases.isNotEmpty)...releases.map((r)=>Padding(padding:const EdgeInsets.only(top:10),child:card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(r['name']??r['tag_name'],style:const TextStyle(fontWeight:FontWeight.bold)),Text(r['tag_name']??''),Text(r['published_at']??'Draft',style:const TextStyle(color:Colors.white54))]))))]));}}

class Docs extends StatefulWidget{const Docs({super.key});@override State<Docs>createState()=>_DocsState();}
class _DocsState extends State<Docs>{String q='';final items=[['Getting Started','Connect GitHub, select a repository, let Project Doctor inspect it, install the workflow and start a build.'],['Automatic setup','WyBuild can add its GitHub Actions workflow through a setup branch and pull request. You do not need to hand-write YAML.'],['Web → Android TWA','Deploy a PWA over HTTPS, provide a manifest and matching Digital Asset Links, then generate a browser-powered TWA APK/AAB without an embedded WebView.'],['Flutter','Flutter projects use the stable Flutter toolchain and can produce APK or AAB artifacts.'],['Android/Gradle','Existing Android projects use their own Gradle wrapper and project configuration.'],['Build logs','Logs come from the original GitHub Actions run, so dependency and Gradle errors are not hidden.'],['Signing','Release signing should be supplied through encrypted CI secrets. Never put keystores or passwords in frontend code.'],['Free plan','5 distinct projects per calendar month are free. Developer tools remain free; Pro adds unlimited projects and selected Android wrapper features.'],['Security','GitHub OAuth is used instead of asking users to paste personal access tokens.']];@override Widget build(BuildContext c){final f=items.where((x)=>(x[0]+' '+x[1]).toLowerCase().contains(q.toLowerCase())).toList();return shell('DOCUMENTATION','Docs & Guide','Understand the complete WyBuild flow.',Column(children:[TextField(decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Search documentation'),onChanged:(v)=>setState(()=>q=v)),const SizedBox(height:12),for(final x in f)Padding(padding:const EdgeInsets.only(bottom:10),child:card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(x[0],style:const TextStyle(fontWeight:FontWeight.bold,fontSize:17)),const SizedBox(height:6),Text(x[1],style:const TextStyle(color:Colors.white60))])))]));}}

// Single source of truth for every selectable native feature: which plan
// Each selectable TWA capability has a short build-menu summary and a longer
// explanation of what the wrapper can configure versus what the website must do.
class NativeFeature{final String key,tier,title,short,long;const NativeFeature(this.key,this.tier,this.title,this.short,this.long);}
const List<NativeFeature> nativeFeatureCatalog=[
  NativeFeature('INTERNET','FREE','Internet access','Always enabled for TWA builds.','The generated Android wrapper always declares INTERNET; this is required to load the HTTPS PWA.'),
  NativeFeature('JAVASCRIPT','FREE','JavaScript execution','Handled by Chrome in a TWA.','Trusted Web Activity content is rendered by the browser. WyBuild does not create a WebView or inject a JavaScript bridge.'),
  NativeFeature('DOM_STORAGE','FREE','DOM storage','Browser-managed localStorage/sessionStorage.','Storage is managed by Chrome for your website origin. The Android host app cannot directly inspect or inject into that browser storage.'),
  NativeFeature('BACK_BUTTON','FREE','Android back navigation','Uses the website/browser navigation history.','TWA delegates web content to Chrome. Use normal website history and routing; WyBuild cannot override Chrome navigation with a native WebView bridge.'),
  NativeFeature('PULL_TO_REFRESH','FREE','Pull-to-refresh gesture','Requires a refresh gesture implemented by the website.','TWA does not expose a native WebView refresh container. Implement pull-to-refresh in your PWA UI if you need this gesture.'),
  NativeFeature('SWIPE_NAVIGATION','FREE','Swipe navigation gestures','Requires website-side gesture handling.','Custom swipe navigation must be implemented in your web app; selecting this option records the requirement and reports it in the workflow summary.'),
  NativeFeature('FILE_PICKER','FREE','File picker','Use HTML input type=file; Chrome handles the picker.','Your PWA must include a file input or supported file picker API. The TWA wrapper does not override Chrome file chooser callbacks.'),
  NativeFeature('SHARE','FREE','Native share sheet','Use the Web Share API from the website.','Your PWA can call navigator.share() after a user gesture on supported browsers; no injected Android bridge is available in TWA.'),
  NativeFeature('VIBRATION','FREE','Vibration / haptics','Adds VIBRATE permission; website calls navigator.vibrate().','The wrapper declares android.permission.VIBRATE when selected. The website must invoke the browser Vibration API, which may be restricted by device/browser policy.'),
  NativeFeature('ORIENTATION','FREE','Screen orientation','Website/browser API; availability varies by browser.','Use the Screen Orientation API in your PWA where supported. TWA cannot expose a custom Android orientation-lock bridge.'),
  NativeFeature('BATTERY','FREE','Battery status','Browser API support is limited and varies.','The Battery Status API is not supported in all browsers for privacy reasons. WyBuild cannot guarantee battery readings from a TWA.'),
  NativeFeature('NETWORK_STATUS','FREE','Network status','Use navigator.onLine and connection events where available.','Network information APIs vary across browsers. Use navigator.onLine and online/offline events as a fallback.'),
  NativeFeature('DEVICE_INFO','FREE','Device information','Use privacy-preserving browser capabilities.','A TWA does not expose Android manufacturer/model through a native bridge. Use user-agent client hints only where available and respect privacy limits.'),
  NativeFeature('LOCAL_NOTIFICATIONS','FREE','Web notifications','Adds Android notification permission declaration; PWA must request permission and configure notifications.','For web push, the site needs a service worker, HTTPS, notification permission and its own push setup. The wrapper permission alone does not create notification delivery.'),
  NativeFeature('CAMERA_MIC','FREE','Camera & microphone permissions','Adds CAMERA and RECORD_AUDIO declarations; website must request getUserMedia.','Chrome controls runtime prompts and permissions for the website origin. The Android manifest declarations do not bypass browser permission prompts.'),
  NativeFeature('LOCATION','FREE','Location permissions','Adds coarse/fine location declarations; website must request geolocation.','Chrome controls site-level location permission. The website must call navigator.geolocation and users must grant access.'),
  NativeFeature('DOWNLOADS','FREE','Downloads','Use browser download links/attributes or supported APIs.','Downloads are handled by Chrome and the website. A TWA does not expose a native DownloadListener bridge.'),
  NativeFeature('EXTERNAL_LINKS','FREE','External links','Handled by Chrome/TWA scope and Android intents.','Links outside the verified website scope may open in a browser/custom tab. Test external navigation with the real domain and Digital Asset Links.'),
  NativeFeature('FULLSCREEN','FREE','Fullscreen display','TWA is fullscreen when verified.','When Digital Asset Links verification succeeds, the TWA hides browser UI. If verification fails, Chrome may show browser UI; selecting this cannot bypass verification.'),
  NativeFeature('BIOMETRIC','PRO','Biometric/passkey authentication','Use WebAuthn/passkeys from the website where supported.','TWA does not provide a custom native BiometricPrompt JavaScript bridge. Use WebAuthn/passkeys and your identity provider instead.'),
  NativeFeature('SECURE_STORAGE','PRO','Secure data handling','Use server-side sessions and appropriate web security.','TWA cannot expose Android Keystore directly to the website. Do not store secrets in localStorage; use secure server-side session design.'),
  NativeFeature('SCREEN_CAPTURE','PRO','Screenshot restrictions','Not enforceable reliably from a TWA web page.','A TWA cannot guarantee FLAG_SECURE-style screenshot blocking because the content is rendered by the browser. Do not select this expecting screenshot protection.'),
  NativeFeature('PICTURE_IN_PICTURE','PRO','Picture-in-picture','Use supported web media/PiP APIs in the website.','The Android host cannot inject a native PiP bridge into Chrome. Browser support and website implementation determine availability.'),
  NativeFeature('DEEP_LINKS','PRO','Verified HTTPS deep links','Adds an auto-verified HTTPS intent filter for the TWA website host.','The generated wrapper adds an Android App Links intent filter for the entered website host. Publish matching Digital Asset Links and implement route handling in the website.'),
];
String featureShort(String key)=>nativeFeatureCatalog.firstWhere((f)=>f.key==key,orElse:()=>NativeFeature(key,'FREE',key,'','')).short;
String featureTitle(String key)=>nativeFeatureCatalog.firstWhere((f)=>f.key==key,orElse:()=>NativeFeature(key,'FREE',key,'','')).title;

class NativeFeatures extends StatefulWidget{const NativeFeatures({super.key});@override State<NativeFeatures>createState()=>_NativeFeaturesState();}
class _NativeFeaturesState extends State<NativeFeatures>{String q='';String? open;
bool _matches(NativeFeature f)=>('${f.title} ${f.short} ${f.long}').toLowerCase().contains(q.toLowerCase());
Widget _row(NativeFeature f)=>card(Column(children:[
  ListTile(
    onTap:()=>setState(()=>open=open==f.key?null:f.key),
    leading:Icon(f.tier=='FREE'?Icons.check_circle_outline:Icons.workspace_premium_outlined,color:f.tier=='FREE'?Colors.greenAccent:Colors.amber),
    title:Text(f.title,style:const TextStyle(fontWeight:FontWeight.bold)),
    subtitle:Text(f.short),
    trailing:Icon(open==f.key?Icons.expand_less:Icons.expand_more),
  ),
  if(open==f.key)Padding(padding:const EdgeInsets.fromLTRB(16,0,16,16),child:Align(alignment:Alignment.centerLeft,child:Text(f.long,style:const TextStyle(color:Colors.white70)))),
]));
Widget _section(String label,String sub,List<NativeFeature> items)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
  Padding(padding:const EdgeInsets.only(top:18,bottom:2),child:Text(label,style:const TextStyle(fontSize:13,fontWeight:FontWeight.bold,color:Colors.white54,letterSpacing:1))),
  Padding(padding:const EdgeInsets.only(bottom:10),child:Text(sub,style:const TextStyle(color:Colors.white38,fontSize:12))),
  for(final f in items.where(_matches)) _row(f),
]);
@override Widget build(BuildContext c){
  final free=nativeFeatureCatalog.where((f)=>f.tier=='FREE').toList();
  final pro=nativeFeatureCatalog.where((f)=>f.tier=='PRO').toList();
  return shell('REFERENCE','Native Features','Some Android capabilities are Pro; browser-only capabilities remain free because they depend on the website rather than WyBuild.',Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    TextField(decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Search native features and gestures'),onChanged:(v)=>setState(()=>q=v)),
    _section('FREE','Available to every developer. Browser-only features still require compatible PWA code.',free.where((f)=>f.key!='INTERNET').toList()),
    _section('PRO','Paid Android wrapper options. The server enforces these entitlements at build time.',pro),
  ]));
}}

class Features extends StatefulWidget{const Features({super.key});@override State<Features>createState()=>_FeaturesState();}
class _FeaturesState extends State<Features>{String q='';int? open;final fs=[['🧠','Automatic project detection','Detect Flutter, Android/Gradle, Vite/React, Node and vanilla HTML.'],['⚙️','One-tap workflow installation','WyBuild creates or updates the GitHub Actions workflow for the repository.'],['🩺','Project Doctor + Play Readiness','Check repository markers, SDK target, release signing, versioning, manifest risks and Play Console tasks before building.'],['📦','APK / AAB generation','Build installable test APKs or signed AABs for Play submission; production AABs require a persistent upload keystore.'],['🌐','Web → Android TWA','A deployed HTTPS PWA can be packaged as a Chrome-powered Trusted Web Activity without embedding a WebView.'],['🆓','Free developer tooling','Base64, SHA-256, HMAC-SHA256, UUIDs, API-key/secret generation, URL tools, JSON formatting and timestamps run locally in the browser.'],['⭐','TWA compatibility checks','Checks HTTPS, web manifest, package ID, signing prerequisites and Digital Asset Links before attempting a TWA build. TWA uses the browser, not an embedded WebView.'],['🔌','TWA-aware feature selection','WyBuild adds supported Android manifest permissions and verified links, and explains website-side API requirements instead of claiming an unavailable native JavaScript bridge.'],['🔍','Real diagnostics','See original workflow status, artifacts and failure details instead of fake progress.'],['🚀','GitHub Releases','Create releases and attach artifacts through GitHub.'],['💳','Simple pricing','5 projects/month are free. Pro is $10/month or $99/year with unlimited projects and selected Pro Android features.'],['🔔','FCM build alerts','Firebase Cloud Messaging can send success/failure alerts when Firebase is configured and repository secret provisioning succeeds.']];@override Widget build(BuildContext c){final f=fs.where((x)=>x.join(' ').toLowerCase().contains(q.toLowerCase())).toList();return shell('WYBUILD / FEATURES','What WyBuild adds to your build','Automation around the annoying parts of Android CI/CD.',Column(children:[TextField(decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Search features'),onChanged:(v)=>setState(()=>q=v)),const SizedBox(height:12),for(int i=0;i<f.length;i++)card(Column(children:[ListTile(onTap:()=>setState(()=>open=open==i?null:i),leading:Text(f[i][0],style:const TextStyle(fontSize:23)),title:Text(f[i][1],style:const TextStyle(fontWeight:FontWeight.bold)),subtitle:Text(f[i][2]),trailing:Icon(open==i?Icons.remove:Icons.add)),if(open==i)const Padding(padding:EdgeInsets.all(12),child:Text('WyBuild performs this step inside the authenticated GitHub/CI flow rather than requiring the developer to manually configure every file.'))]))]));}}

class DevTools extends StatefulWidget{const DevTools({super.key});@override State<DevTools>createState()=>_DevToolsState();}
class _DevToolsState extends State<DevTools>{
 String tool='Base64 Encode',input='',output='';
 final rng=Random.secure();
 final tools={
  'Encoding & data':['Base64 Encode','Base64 Decode','Base64URL Encode','Base64URL Decode','URL Encode','URL Decode','JSON Format'],
  'Hashing & crypto':['SHA-256','SHA-1','SHA-512','MD5','HMAC-SHA256'],
  'Keys & identifiers':['UUID v4','API Key','Random Secret'],
  'Web / API helpers':['JWT Decode','Unix Timestamp'],
 };
 List<String> get flatTools=>tools.values.expand((x)=>x).toList();
 String randomHex(int n){final b=List<int>.generate(n,(_)=>rng.nextInt(256));return b.map((x)=>x.toRadixString(16).padLeft(2,'0')).join();}
 String uuid(){final b=List<int>.generate(16,(_)=>rng.nextInt(256));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;final h=b.map((x)=>x.toRadixString(16).padLeft(2,'0')).join();return '${h.substring(0,8)}-${h.substring(8,12)}-${h.substring(12,16)}-${h.substring(16,20)}-${h.substring(20)}';}
 void run(){try{switch(tool){case 'Base64 Encode':output=base64.encode(utf8.encode(input));break;case 'Base64 Decode':output=utf8.decode(base64.decode(input.trim()));break;case 'Base64URL Encode':output=base64Url.encode(utf8.encode(input));break;case 'Base64URL Decode':output=utf8.decode(base64Url.decode(base64Url.normalize(input.trim())));break;case 'SHA-256':output=sha256.convert(utf8.encode(input)).toString();break;case 'SHA-1':output=sha1.convert(utf8.encode(input)).toString();break;case 'SHA-512':output=sha512.convert(utf8.encode(input)).toString();break;case 'MD5':output=md5.convert(utf8.encode(input)).toString();break;case 'JWT Decode':final jwtParts=input.split('.');if(jwtParts.length!=3)throw FormatException('A JWT must contain three dot-separated parts.');final payload=jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(jwtParts[1]))));output=const JsonEncoder.withIndent('  ').convert(payload);break;case 'HMAC-SHA256':final hmacParts=input.split('\n');final secret=hmacParts.isEmpty?'':hmacParts.first;final message=hmacParts.length>1?hmacParts.sublist(1).join('\n'):'';output=Hmac(sha256,utf8.encode(secret)).convert(utf8.encode(message)).toString();break;case 'UUID v4':output=uuid();break;case 'API Key':output='wy_${randomHex(24)}';break;case 'Random Secret':output=randomHex(32);break;case 'URL Encode':output=Uri.encodeComponent(input);break;case 'URL Decode':output=Uri.decodeComponent(input);break;case 'JSON Format':final v=jsonDecode(input);output=const JsonEncoder.withIndent('  ').convert(v);break;case 'Unix Timestamp':output=(DateTime.now().millisecondsSinceEpoch~/1000).toString();break;}setState((){});}catch(e){setState(()=>output='Error: $e');}}
 @override Widget build(BuildContext c)=>shell('FREE DEVELOPER TOOLS','Developer Toolbox','Common encoding, hashing, key and API helpers. Everything runs locally in the browser.',Column(children:[
  for(final entry in tools.entries) ExpansionTile(title:Text(entry.key,style:const TextStyle(fontWeight:FontWeight.bold)),subtitle:Text('${entry.value.length} tools'),children:[Padding(padding:const EdgeInsets.fromLTRB(12,0,12,12),child:Wrap(spacing:8,runSpacing:8,children:[for(final name in entry.value)ChoiceChip(label:Text(name),selected:tool==name,onSelected:(_)=>setState(()=>tool=name))]))]),
  const SizedBox(height:8),card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Selected tool: $tool',style:const TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:10),if(tool!='UUID v4'&&tool!='API Key'&&tool!='Random Secret'&&tool!='Unix Timestamp')TextField(minLines:5,maxLines:12,decoration:const InputDecoration(labelText:'Input',hintText:'Paste text here'),onChanged:(v)=>input=v),const SizedBox(height:12),btn('Run $tool',run,icon:Icons.play_arrow),if(output.isNotEmpty)...[const SizedBox(height:12),card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('Output',style:TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:8),SelectableText(output,style:const TextStyle(fontFamily:'monospace'))]))]])),
  const SizedBox(height:12),card(const Text('Free tools never send your input to WyBuild. Generated secrets are convenience values only; use a proper secret manager for production credentials.',style:TextStyle(color:Colors.white60)))
 ]));
}
class Billing extends StatefulWidget{final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Billing({super.key,this.session,required this.onLogin,required this.snack});@override State<Billing>createState()=>_BillingState();}
class _BillingState extends State<Billing>{Map? status;bool loading=true;@override void initState(){super.initState();load();}Future<void>load()async{if(widget.session==null){setState(()=>loading=false);return;}try{status=await api.call('/api/billing/status');}catch(e){widget.snack(e.toString());}finally{if(mounted)setState(()=>loading=false);}}void openCheckout(String? url){if(url==null||url.isEmpty){widget.snack('Checkout is not configured yet. Set WYBUILD_PRO_MONTHLY_URL or WYBUILD_PRO_YEARLY_URL in Vercel.');return;}final uid=widget.session?['user']?['id']?.toString()??'';web.window.open(url.replaceAll('{USER_ID}',Uri.encodeComponent(uid)),'_blank');}@override Widget build(BuildContext c){final pro=status?['plan']=='PRO';final used=status?['projectsUsed']??0;final limit=status?['projectLimit'];return shell('WYBUILD / PLANS','Simple developer pricing','Keep useful developer tools free; charge only for project capacity and selected Android features.',Column(children:[if(loading)const CircularProgressIndicator(),card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(pro?'PRO PLAN':'FREE PLAN',style:const TextStyle(fontWeight:FontWeight.bold,fontSize:18)),const SizedBox(height:8),Text(pro?'Unlimited projects.':'$used / ${limit??5} projects used this month.'),const SizedBox(height:14),const Text('FREE',style:TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:4),const Text('5 projects per calendar month • Free developer tools • Core TWA features • Diagnostics and build tooling.'),const SizedBox(height:14),const Text('PRO',style:TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:4),const Text('\$10/month or \$99/year • Unlimited projects • Pro Android features • Higher build concurrency.'),const SizedBox(height:14),if(!pro)Row(children:[Expanded(child:btn('\$10/month',()=>openCheckout(status?['checkoutMonthlyUrl']?.toString()),icon:Icons.credit_card)),const SizedBox(width:10),Expanded(child:btn('\$99/year',()=>openCheckout(status?['checkoutYearlyUrl']?.toString()),secondary:true,icon:Icons.calendar_month))]) else const Text('Your Pro entitlement is active.',style:TextStyle(color:Colors.greenAccent)),const SizedBox(height:12),const Text('Payments are handled by your configured checkout provider. WyBuild never stores card details. The signed billing webhook updates the Pro entitlement server-side.',style:TextStyle(color:Colors.white60,fontSize:12))]))]));}}

class Settings extends StatelessWidget{final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Settings({super.key,this.session,required this.onLogin,required this.snack});Future<void> enablePush() async {try{final token=(await wybuildEnablePush().toDart).toDart;await api.call('/api/notifications/register',method:'POST',body:{'token':token});snack('Build push notifications enabled for this browser.');}catch(e){snack(e.toString().replaceFirst('Exception: ',''));}}@override Widget build(BuildContext c)=>shell('ACCOUNT','Settings','GitHub connection, build alerts and security.',Column(children:[card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('GitHub',style:TextStyle(fontWeight:FontWeight.bold,fontSize:18)),Text(session==null?'Not connected.':'Connected as @${session!['user']['login']}'),const SizedBox(height:10),btn(session==null?'Connect GitHub':'Disconnect GitHub',session==null?onLogin:()async{try{await api.logout();web.window.location.reload();}catch(e){snack(e.toString());}},icon:session==null?Icons.login:Icons.link_off),if(session!=null) ...[const SizedBox(height:10),btn('Enable build push notifications',enablePush,secondary:true,icon:Icons.notifications_active_outlined),const SizedBox(height:6),const Text('Get a push notification when a WyBuild workflow succeeds or fails. This requires Firebase setup by the WyBuild administrator.',style:TextStyle(color:Colors.white60))]])),const SizedBox(height:12),card(const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Security',style:TextStyle(fontWeight:FontWeight.bold,fontSize:18)),SizedBox(height:6),Text('GitHub tokens stay inside the server-side session. Firebase service-account credentials stay server-side in Vercel; only public Firebase web configuration belongs in web/firebase-config.js.')]))]));}

class Help extends StatelessWidget{final void Function(String) go;const Help({super.key,required this.go});@override Widget build(BuildContext c)=>shell('SUPPORT','Help','Recovery paths for common WyBuild problems.',Column(children:[card(const _HelpItem('GitHub connection failed','Check OAuth credentials, callback URL and repository permissions. Reconnect after fixing them.')),card(const _HelpItem('Workflow not found','Open Projects → Project Doctor → Install / update workflow. GitHub manual dispatch requires the workflow on the default branch.')),card(const _HelpItem('Web → APK failed','Confirm the web project produces a static index.html. Next.js server output needs a static export or an existing Android wrapper.')),card(const _HelpItem('Build failed','Open the original GitHub Actions logs. WyBuild should expose the failing stage instead of hiding it.')),btn('Open Docs',()=>go('docs'),secondary:true,icon:Icons.menu_book)]));}
class _HelpItem extends StatelessWidget{final String a,b;const _HelpItem(this.a,this.b);@override Widget build(BuildContext c)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(a,style:const TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:6),Text(b,style:const TextStyle(color:Colors.white60))]);}

class Legal extends StatelessWidget{final String title,text;const Legal({super.key,required this.title,required this.text});@override Widget build(BuildContext c)=>shell('LEGAL INFORMATION',title,'Review before commercial launch.',card(Text(text)));}

const privacyText='WyBuild receives GitHub identity and authorized repository/build information needed to operate the service. Source code remains on GitHub except when a selected GitHub Actions workflow processes it. Application metadata may include projects, builds, releases and usage. Payment verification is handled by WyDev; WyBuild does not store card credentials. OAuth tokens are held in an encrypted HttpOnly server session.';
const termsText='WyBuild connects authorized GitHub repositories to isolated GitHub Actions workflows for builds and releases. You remain responsible for your source code, dependencies, licenses, credentials and configuration. Do not use WyBuild for unlawful software, malware or content you do not have rights to use. Build execution and artifact retention depend on GitHub Actions and configured workflow settings.';
