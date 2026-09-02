import 'dart:convert';
import 'dart:html' as html;
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

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
    } catch (e) {
      throw Exception('Network error. Check your connection and retry.');
    }
    dynamic data;
    try { data = r.body.isEmpty ? {} : jsonDecode(r.body); } catch (_) { data = {}; }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      if (r.statusCode == 401 && path == '/api/auth/me') return {'authenticated':false};
      throw Exception(data is Map && data['error'] != null ? data['error'] : 'Request failed (${r.statusCode})');
    }
    return data;
  }
  void login() => html.window.location.assign('/api/auth/github');
  Future<void> logout() async { await call('/api/auth/logout', method:'POST'); }
}

final api = Api();

class WyBuildApp extends StatefulWidget {
  const WyBuildApp({super.key});
  @override State<WyBuildApp> createState() => _WyBuildAppState();
}
class _WyBuildAppState extends State<WyBuildApp> {
  String page = 'home';
  bool drawer = false;
  Map<String,dynamic>? session;
  bool loadingSession = true;

  final pages = const [
    ('dashboard','Dashboard',Icons.dashboard_outlined),
    ('projects','Projects',Icons.build_circle_outlined),
    ('builds','Builds',Icons.history),
    ('releases','Releases',Icons.rocket_launch_outlined),
    ('docs','Docs & Guide',Icons.menu_book_outlined),
    ('features','Build Features',Icons.auto_awesome_outlined),
    ('billing','Billing',Icons.credit_card_outlined),
    ('settings','Settings',Icons.settings_outlined),
    ('help','Help',Icons.help_outline),
    ('privacy','Privacy',Icons.lock_outline),
    ('terms','Terms',Icons.description_outlined),
  ];

  @override void initState() { super.initState(); loadSession(); }
  Future<void> loadSession() async {
    try {
      final d = await api.call('/api/auth/me');
      if (mounted) setState(() { session = d['authenticated'] == true ? Map<String,dynamic>.from(d) : null; loadingSession=false; });
    } catch (_) { if (mounted) setState(()=>loadingSession=false); }
  }
  void go(String p) => setState(() { page=p; drawer=false; });

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
            if (loadingSession) const Padding(padding:EdgeInsets.all(16), child:SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2)))
            else TextButton.icon(onPressed:session==null?api.login:()=>logout(), icon:Icon(session==null?Icons.login:Icons.account_circle_outlined), label:Text(session==null?'Connect GitHub':'@${session!['user']['login']}'))
          ],
        ),
        body: Row(children:[
          if (drawer || MediaQuery.of(context).size.width >= 900) SizedBox(width:260, child: _sideNav()),
          Expanded(child: _content()),
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
      case 'projects': return Projects(session:session, onLogin:api.login, snack:snack);
      case 'builds': return Builds(session:session, onLogin:api.login, snack:snack);
      case 'releases': return Releases(session:session, onLogin:api.login, snack:snack);
      case 'docs': return Docs();
      case 'features': return Features();
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
  final good=s=='success'||s=='completed'; final bad=s=='failure'||s=='cancelled';
  return Chip(label:Text(s),avatar:Icon(good?Icons.check:bad?Icons.close:Icons.hourglass_empty,size:15),backgroundColor:good?Colors.green.withOpacity(.15):bad?Colors.red.withOpacity(.15):Colors.amber.withOpacity(.12));
}

class Home extends StatelessWidget {
  final VoidCallback onLogin; final void Function(String) go;
  const Home({super.key,required this.onLogin,required this.go});
  @override Widget build(BuildContext c)=>shell('WYBUILD / AUTOMATIC ANDROID SHIPPING','Build, fix and ship from GitHub.','WyBuild removes the annoying setup work around Android builds, Gradle, workflows and CI.',Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Your build engineer in a web app.',style:TextStyle(fontSize:24,fontWeight:FontWeight.bold)),
      const SizedBox(height:10),const Text('Connect a repository. WyBuild detects the stack, installs the GitHub Actions workflow when needed, prepares the build path and gives you the real APK/AAB artifact. Web projects can also be packaged into a lightweight Android WebView wrapper.'),
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
 Future<void> load() async {if(widget.session==null){setState(()=>loading=false);return;}try{final rs=await api.call('/api/github/repos');int rr=0,ss=0;for(final r in rs){final x=await api.call('/api/github/runs',q:{'owner':r['owner']['login'],'repo':r['name']});for(final w in (x['workflow_runs']??[])){if(w['name']=='WyBuild'){rr++;if(w['conclusion']=='success')ss++;}}}if(mounted)setState(() { repos=rs.length; runs=rr; success=ss; loading=false; });}catch(e){if(mounted)setState(() { error=e.toString(); loading=false; });}}
 @override Widget build(BuildContext c)=>shell('OVERVIEW','Dashboard','Your GitHub-connected build workspace.',loading?const Center(child:CircularProgressIndicator()):Column(children:[
  if(error.isNotEmpty) card(Text(error)),
  Row(children:[Expanded(child:card(_stat('Repositories','$repos'))),const SizedBox(width:12),Expanded(child:card(_stat('WyBuild runs','$runs'))),const SizedBox(width:12),Expanded(child:card(_stat('Successful','$success')))]),
  const SizedBox(height:14),card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('Ready to build?',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),const SizedBox(height:8),const Text('Select a repository and let WyBuild handle the workflow setup.'),const SizedBox(height:14),btn('New Build',()=>widget.go('projects'),icon:Icons.add)]))
 ]));
 Widget _stat(String a,String b)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(a,style:const TextStyle(color:Colors.white54)),const SizedBox(height:8),Text(b,style:const TextStyle(fontSize:28,fontWeight:FontWeight.bold))]);
}

class Projects extends StatefulWidget {
 final Map<String,dynamic>? session; final VoidCallback onLogin; final void Function(String) snack;
 const Projects({super.key,this.session,required this.onLogin,required this.snack});
 @override State<Projects> createState()=>_ProjectsState();
}
class _ProjectsState extends State<Projects>{
 List repos=[]; List branches=[]; Map<String,dynamic>? repo; String branch=''; String target='auto'; bool loading=false,setup=false,checking=false; Map<String,dynamic>? workflow,diagnosis; String error='',message='';
 final targets={'auto':('Auto Detect','auto','release'),'debug':('Android APK • Debug','apk','debug'),'apk':('Android APK • Release','apk','release'),'aab':('Android AAB • Play Store','aab','release'),'web':('Web App','web','release'),'webapk':('Web → Android APK','apk','release')};
 @override void initState(){super.initState();if(widget.session!=null)loadRepos();}
 Future<void> loadRepos() async {try{final x=await api.call('/api/github/repos');if(mounted)setState(()=>repos=x);}catch(e){setState(()=>error=e.toString());}}
 Future<void> selectRepo(dynamic r) async {setState(() { repo=Map<String,dynamic>.from(r); branches=[]; branch=''; workflow=null; diagnosis=null; });try{final b=await api.call('/api/github/branches',q:{'owner':r['owner']['login'],'repo':r['name']});if(mounted)setState(() { branches=b; branch=r['default_branch']; });await diagnose();}catch(e){setState(()=>error=e.toString());}}
 Future<void> diagnose() async {if(repo==null||branch.isEmpty)return;setState(()=>checking=true);try{final d=await api.call('/api/github/diagnose',q:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch});if(mounted)setState(()=>diagnosis=Map<String,dynamic>.from(d));}catch(e){/* older backend */}finally{if(mounted)setState(()=>checking=false);}}
 Future<void> check() async {if(repo==null)return;setState(()=>checking=true);try{final d=await api.call('/api/github/workflow',q:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch});setState(()=>workflow=d);}catch(e){setState(()=>error=e.toString());}finally{setState(()=>checking=false);}}
 Future<void> install() async {if(repo==null)return;setState(()=>setup=true);try{final d=await api.call('/api/github/install-workflow',method:'POST',body:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch});setState(()=>message=d['message']??'Workflow setup complete.');await check();}catch(e){setState(()=>error=e.toString());}finally{setState(()=>setup=false);}}
 Future<void> doBuild() async {if(repo==null)return;final t=targets[target]!;setState(()=>loading=true);try{await api.call('/api/github/dispatch',method:'POST',body:{'owner':repo!['owner']['login'],'repo':repo!['name'],'ref':branch,'inputs':{'build_type':t.$2,'build_mode':t.$3}});setState(()=>message='Build queued in GitHub Actions. Open Builds to monitor it.');}catch(e){setState(()=>error=e.toString());}finally{setState(()=>loading=false);}}
 @override Widget build(BuildContext c){
  if(widget.session==null)return shell('WORKSPACE','Projects','Connect GitHub to let WyBuild inspect repositories and install workflows.',card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('GitHub connection required',style:TextStyle(fontSize:19,fontWeight:FontWeight.bold)),const SizedBox(height:8),const Text('WyBuild uses GitHub authorization instead of asking you to paste a personal access token.'),const SizedBox(height:14),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));
  return shell('WORKSPACE','Projects','Pick a repository. WyBuild will diagnose the project, set up the workflow and run the build.',Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   if(error.isNotEmpty) _notice(error,true),
   if(message.isNotEmpty) _notice(message,false),
   card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    const Text('1. Select project',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),const SizedBox(height:12),
    DropdownButtonFormField<dynamic>(value:repo,decoration:const InputDecoration(labelText:'GitHub repository'),items:repos.map((r)=>DropdownMenuItem(value:r,child:Text(r['full_name']))).toList(),onChanged:(r){if(r!=null)selectRepo(r);}),
    if(repo!=null) ...[const SizedBox(height:12),DropdownButtonFormField<String>(value:branch.isEmpty?null:branch,decoration:const InputDecoration(labelText:'Branch'),items:branches.map((b)=>DropdownMenuItem(value:b['name'] as String,child:Text(b['name']))).toList(),onChanged:(v){if(v!=null){setState(()=>branch=v);diagnose();}},)],
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
        btn(workflow!['dispatchable']==true?'Workflow ready':'Install / update workflow',workflow!['dispatchable']==true?null:install,icon:Icons.settings_suggest),
      ],
    ])),
    const SizedBox(height:12),
    card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('3. Build target',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),const SizedBox(height:12),
      DropdownButtonFormField<String>(value:target,decoration:const InputDecoration(labelText:'What do you want?'),items:targets.entries.map((e)=>DropdownMenuItem(value:e.key,child:Text(e.value.$1))).toList(),onChanged:(v)=>setState(()=>target=v??'auto')),
      const SizedBox(height:12),
      if(target=='webapk') const Text('For static Vite/React/HTML projects, WyBuild builds the web output, creates a temporary Android WebView wrapper, installs the Android build toolchain and returns an APK. No Android Studio setup is required on your phone.',style:TextStyle(color:Colors.white70)),
      const SizedBox(height:12),btn(loading?'Building…':'Build Now',loading?null:doBuild,icon:Icons.rocket_launch),
    ])),
   ]
  ]));
 }
 Widget _notice(String s,bool bad)=>Container(width:double.infinity,margin:const EdgeInsets.only(bottom:12),padding:const EdgeInsets.all(14),decoration:BoxDecoration(color:(bad?Colors.red:Colors.green).withOpacity(.12),borderRadius:BorderRadius.circular(10)),child:Text(s.replaceFirst('Exception: ','')));
 Widget _diagnosis(Map d)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
  Text('Detected: ${d['type']??'unknown'}',style:const TextStyle(fontWeight:FontWeight.bold)),
  const SizedBox(height:8),
  for(final x in (d['checks']??[])) Row(children:[Icon(x['ok']==true?Icons.check_circle:Icons.radio_button_unchecked,color:x['ok']==true?Colors.green:Colors.white38,size:18),const SizedBox(width:8),Expanded(child:Text('${x['label']}'))]),
  if(d['recommendation']!=null) ...[const SizedBox(height:8),Text('Recommended: ${d['recommendation']}',style:const TextStyle(color:Colors.white70))],
 ]);
}

class Builds extends StatefulWidget {final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Builds({super.key,this.session,required this.onLogin,required this.snack});@override State<Builds> createState()=>_BuildsState();}
class _BuildsState extends State<Builds>{List runs=[];bool loading=true;String error='';Timer? timer;@override void initState(){super.initState();load();} @override void dispose(){timer?.cancel();super.dispose();}
Future<void> load()async{if(widget.session==null){setState(()=>loading=false);return;}try{final rs=await api.call('/api/github/repos');final out=[];for(final r in rs){final x=await api.call('/api/github/runs',q:{'owner':r['owner']['login'],'repo':r['name']});for(final w in (x['workflow_runs']??[])){if(w['name']=='WyBuild')out.add({...w,'repo':r['full_name'],'repoName':r['name'],'owner':r['owner']['login']});}}out.sort((a,b)=>DateTime.parse(b['created_at']).compareTo(DateTime.parse(a['created_at'])));if(mounted)setState(() { runs=out.take(100).toList(); loading=false; });}catch(e){if(mounted)setState(() { error=e.toString(); loading=false; });}}
@override Widget build(BuildContext c){if(widget.session==null)return shell('HISTORY','Builds','Real GitHub Actions history.',card(Column(children:[const Text('Connect GitHub first'),const SizedBox(height:8),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));return shell('HISTORY','Builds','Showing WyBuild runs across your accessible repositories.',Column(children:[if(loading)const CircularProgressIndicator(),if(error.isNotEmpty)_notice(error),if(!loading&&runs.isEmpty)card(const Text('No WyBuild runs found. Start a build from Projects.')),for(final r in runs)RunCard(run:r,onRefresh:load,snack:widget.snack)]));}
Widget _notice(String s)=>Padding(padding:const EdgeInsets.only(bottom:12),child:card(Text(s.replaceFirst('Exception: ',''))));
}

class RunCard extends StatefulWidget{final dynamic run;final Future<void> Function() onRefresh;final void Function(String) snack;const RunCard({super.key,required this.run,required this.onRefresh,required this.snack});@override State<RunCard> createState()=>_RunCardState();}
class _RunCardState extends State<RunCard>{dynamic detail;bool busy=false;@override void initState(){super.initState();detail=widget.run;}Future<void> refresh()async{setState(()=>busy=true);try{detail=await api.call('/api/github/run',q:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});setState((){});}catch(e){widget.snack(e.toString());}finally{setState(()=>busy=false);}}
Future<void> rerun()async{try{await api.call('/api/github/rerun',method:'POST',body:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});await refresh();}catch(e){widget.snack(e.toString());}}
Future<void> artifacts()async{try{final d=await api.call('/api/github/artifacts',q:{'owner':widget.run['owner'],'repo':widget.run['repoName'],'id':'${widget.run['id']}'});showDialog(context:context,builder:(_)=>AlertDialog(title:const Text('Artifacts'),content:SizedBox(width:400,child:Wrap(spacing:8,runSpacing:8,children:[for(final a in d['artifacts']??[])btn('Download ${a['name']}',()=>html.window.location.assign('/api/github/artifact?owner=${widget.run['owner']}&repo=${widget.run['repoName']}&id=${a['id']}'))]))));}catch(e){widget.snack(e.toString());}}
@override Widget build(BuildContext c)=>Padding(padding:const EdgeInsets.only(bottom:12),child:card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Row(children:[Expanded(child:Text('${detail['name']} • ${widget.run['repo']}',style:const TextStyle(fontWeight:FontWeight.bold))),statusChip('${detail['conclusion']??detail['status']}')]),const SizedBox(height:7),Text(DateTime.parse(detail['created_at']).toLocal().toString(),style:const TextStyle(color:Colors.white54)),const SizedBox(height:12),Wrap(spacing:8,runSpacing:8,children:[btn(busy?'Refreshing…':'Refresh',busy?null:refresh,secondary:true,icon:Icons.refresh),if(detail['conclusion']=='failure')btn('Rebuild',rerun,secondary:true,icon:Icons.replay),btn('Artifacts',artifacts,secondary:true,icon:Icons.download),btn('Logs',()=>html.window.location.assign('/api/github/logs?owner=${widget.run['owner']}&repo=${widget.run['repoName']}&id=${widget.run['id']}'),secondary:true,icon:Icons.list_alt),if(detail['html_url']!=null)btn('GitHub',()=>html.window.location.assign(detail['html_url']),secondary:true,icon:Icons.open_in_new)]),])));
}

class Releases extends StatefulWidget{final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Releases({super.key,this.session,required this.onLogin,required this.snack});@override State<Releases> createState()=>_ReleasesState();}
class _ReleasesState extends State<Releases>{List repos=[];String repo='';String tag='',name='',notes='';bool pre=false,loading=false;List releases=[];@override void initState(){super.initState();load();}Future<void>load()async{if(widget.session==null)return;try{repos=await api.call('/api/github/repos');setState((){});}catch(e){widget.snack(e.toString());}}Future<void>get()async{if(repo.isEmpty)return;final p=repo.split('/');try{releases=await api.call('/api/github/releases',q:{'owner':p[0],'repo':p[1]});setState((){});}catch(e){widget.snack(e.toString());}}
Future<void>create()async{if(repo.isEmpty||tag.trim().isEmpty)return;setState(()=>loading=true);try{final p=repo.split('/');await api.call('/api/github/releases',method:'POST',body:{'owner':p[0],'repo':p[1],'tag_name':tag.trim(),'name':name.trim().isEmpty?tag.trim():name.trim(),'body':notes.trim(),'prerelease':pre,'draft':false,'generate_release_notes':notes.trim().isEmpty});tag='';name='';notes='';await get();}catch(e){widget.snack(e.toString());}finally{setState(()=>loading=false);}}
@override Widget build(BuildContext c){if(widget.session==null)return shell('SHIP','Releases','Create real GitHub Releases.',card(Column(children:[const Text('Connect GitHub first'),const SizedBox(height:8),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));return shell('SHIP','Releases','Publish a version after a successful build.',Column(children:[card(Column(children:[DropdownButtonFormField<String>(value:repo.isEmpty?null:repo,decoration:const InputDecoration(labelText:'Repository'),items:repos.map((r)=>DropdownMenuItem(value:r['full_name'] as String,child:Text(r['full_name']))).toList(),onChanged:(v){repo=v??'';get();}),const SizedBox(height:10),TextField(decoration:const InputDecoration(labelText:'Tag name',hintText:'v1.0.0'),onChanged:(v)=>tag=v),const SizedBox(height:10),TextField(decoration:const InputDecoration(labelText:'Release name'),onChanged:(v)=>name=v),const SizedBox(height:10),TextField(minLines:4,maxLines:7,decoration:const InputDecoration(labelText:'Release notes'),onChanged:(v)=>notes=v),const SizedBox(height:10),SwitchListTile(title:const Text('Pre-release'),value:pre,onChanged:(v)=>setState(()=>pre=v)),btn(loading?'Creating…':'Create GitHub Release',loading?null:create,icon:Icons.rocket_launch)])),if(releases.isNotEmpty)...releases.map((r)=>Padding(padding:const EdgeInsets.only(top:10),child:card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(r['name']??r['tag_name'],style:const TextStyle(fontWeight:FontWeight.bold)),Text(r['tag_name']??''),Text(r['published_at']??'Draft',style:const TextStyle(color:Colors.white54))]))))]));}}

class Docs extends StatefulWidget{const Docs({super.key});@override State<Docs>createState()=>_DocsState();}
class _DocsState extends State<Docs>{String q='';final items=[['Getting Started','Connect GitHub, select a repository, let Project Doctor inspect it, install the workflow and start a build.'],['Automatic setup','WyBuild can add its GitHub Actions workflow through a setup branch and pull request. You do not need to hand-write YAML.'],['Web → Android APK','Static Vite/React/HTML output can be copied into a generated Android WebView project during CI, then Gradle produces the APK.'],['Flutter','Flutter projects use the stable Flutter toolchain and can produce APK or AAB artifacts.'],['Android/Gradle','Existing Android projects use their own Gradle wrapper and project configuration.'],['Build logs','Logs come from the original GitHub Actions run, so dependency and Gradle errors are not hidden.'],['Signing','Release signing should be supplied through encrypted CI secrets. Never put keystores or passwords in frontend code.'],['Billing','WyDev remains the server-side billing authority. The frontend never proves payment by itself.'],['Security','GitHub OAuth is used instead of asking users to paste personal access tokens.']];@override Widget build(BuildContext c){final f=items.where((x)=>(x[0]+' '+x[1]).toLowerCase().contains(q.toLowerCase())).toList();return shell('DOCUMENTATION','Docs & Guide','Understand the complete WyBuild flow.',Column(children:[TextField(decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Search documentation'),onChanged:(v)=>setState(()=>q=v)),const SizedBox(height:12),for(final x in f)Padding(padding:const EdgeInsets.only(bottom:10),child:card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(x[0],style:const TextStyle(fontWeight:FontWeight.bold,fontSize:17)),const SizedBox(height:6),Text(x[1],style:const TextStyle(color:Colors.white60))])))]));}}

class Features extends StatefulWidget{const Features({super.key});@override State<Features>createState()=>_FeaturesState();}
class _FeaturesState extends State<Features>{String q='';int? open;final fs=[['🧠','Automatic project detection','Detect Flutter, Android/Gradle, Vite/React, Node and vanilla HTML.'],['⚙️','One-tap workflow installation','WyBuild creates or updates the GitHub Actions workflow for the repository.'],['🩺','Project Doctor','Check repository markers before building and get a recommended path.'],['📦','APK generation','Build an installable APK from Flutter, Android/Gradle or supported static web projects.'],['🌐','Web → Android wrapper','Static web output is placed into a generated Android WebView project in CI.'],['🦋','Flutter APK & AAB','Build Flutter Android packages through GitHub Actions.'],['🔍','Real diagnostics','See original workflow status, artifacts and failure details instead of fake progress.'],['🚀','GitHub Releases','Create releases and attach artifacts through GitHub.'],['🔐','Secrets stay server-side','OAuth tokens and billing service secrets are not exposed to the browser.'],['💳','Server-verified billing','Build limits are enforced by the backend using the WyDev entitlement.']];@override Widget build(BuildContext c){final f=fs.where((x)=>x.join(' ').toLowerCase().contains(q.toLowerCase())).toList();return shell('WYBUILD / FEATURES','What WyBuild adds to your build','Automation around the annoying parts of Android CI/CD.',Column(children:[TextField(decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Search features'),onChanged:(v)=>setState(()=>q=v)),const SizedBox(height:12),for(int i=0;i<f.length;i++)card(Column(children:[ListTile(onTap:()=>setState(()=>open=open==i?null:i),leading:Text(f[i][0],style:const TextStyle(fontSize:23)),title:Text(f[i][1],style:const TextStyle(fontWeight:FontWeight.bold)),subtitle:Text(f[i][2]),trailing:Icon(open==i?Icons.remove:Icons.add)),if(open==i)const Padding(padding:EdgeInsets.all(12),child:Text('WyBuild performs this step inside the authenticated GitHub/CI flow rather than requiring the developer to manually configure every file.'))]))]));}}

class Billing extends StatefulWidget{final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Billing({super.key,this.session,required this.onLogin,required this.snack});@override State<Billing>createState()=>_BillingState();}
class _BillingState extends State<Billing>{Map? status;bool loading=true;@override void initState(){super.initState();load();}Future<void>load()async{if(widget.session==null){setState(()=>loading=false);return;}try{status=await api.call('/api/billing/status');}catch(e){widget.snack(e.toString());}finally{setState(()=>loading=false);}}@override Widget build(BuildContext c){if(widget.session==null)return shell('SUBSCRIPTION','Billing','Billing is connected to the authenticated WyDev account.',card(Column(children:[const Text('Connect GitHub first'),const SizedBox(height:8),btn('Connect GitHub',widget.onLogin,icon:Icons.login)])));return shell('SUBSCRIPTION','Billing','WyDev remains the billing authority.',Column(children:[if(loading)const CircularProgressIndicator(),if(status!=null)card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('CURRENT PLAN: ${status!['plan']??'FREE'}',style:const TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:8),Text('${status!['buildsUsed']??0} / ${status!['buildLimit']??5} successful builds used this month'),Text('${status!['inProgressBuilds']??0} / ${status!['concurrencyLimit']??1} builds in progress'),const SizedBox(height:14),if(status!['billingUrl']!=null)btn('Manage subscription',()=>html.window.location.assign(status!['billingUrl']),icon:Icons.open_in_new)])),const SizedBox(height:12),...planCards()]));}
List<Widget>planCards()=>[['FREE','₦0 / \$0','5 builds / month'],['PRO','₦15,000 / \$9.99','50 builds / month'],['PRO+','₦30,000 / \$19.99','200 builds / month']].map((p)=>Padding(padding:const EdgeInsets.only(bottom:10),child:card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(p[0],style:const TextStyle(color:Colors.white54)),Text(p[1],style:const TextStyle(fontSize:20,fontWeight:FontWeight.bold)),Text(p[2],style:const TextStyle(color:Colors.white60))])))).toList();}

class Settings extends StatelessWidget{final Map<String,dynamic>? session;final VoidCallback onLogin;final void Function(String) snack;const Settings({super.key,this.session,required this.onLogin,required this.snack});@override Widget build(BuildContext c)=>shell('ACCOUNT','Settings','GitHub connection and security.',Column(children:[card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('GitHub',style:TextStyle(fontWeight:FontWeight.bold,fontSize:18)),Text(session==null?'Not connected.':'Connected as @${session!['user']['login']}'),const SizedBox(height:10),btn(session==null?'Connect GitHub':'Disconnect GitHub',session==null?onLogin:()async{try{await api.logout();html.window.location.reload();}catch(e){snack(e.toString());}},icon:session==null?Icons.login:Icons.link_off)])),const SizedBox(height:12),card(const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Security',style:TextStyle(fontWeight:FontWeight.bold,fontSize:18)),SizedBox(height:6),Text('GitHub tokens stay inside the server-side session. Do not put GitHub, billing or signing secrets in Flutter Web code.')]))]));}

class Help extends StatelessWidget{final void Function(String) go;const Help({super.key,required this.go});@override Widget build(BuildContext c)=>shell('SUPPORT','Help','Recovery paths for common WyBuild problems.',Column(children:[card(const _HelpItem('GitHub connection failed','Check OAuth credentials, callback URL and repository permissions. Reconnect after fixing them.')),card(const _HelpItem('Workflow not found','Open Projects → Project Doctor → Install / update workflow. GitHub manual dispatch requires the workflow on the default branch.')),card(const _HelpItem('Web → APK failed','Confirm the web project produces a static index.html. Next.js server output needs a static export or an existing Android wrapper.')),card(const _HelpItem('Build failed','Open the original GitHub Actions logs. WyBuild should expose the failing stage instead of hiding it.')),btn('Open Docs',()=>go('docs'),secondary:true,icon:Icons.menu_book)]));}
class _HelpItem extends StatelessWidget{final String a,b;const _HelpItem(this.a,this.b);@override Widget build(BuildContext c)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(a,style:const TextStyle(fontWeight:FontWeight.bold)),const SizedBox(height:6),Text(b,style:const TextStyle(color:Colors.white60))]);}

class Legal extends StatelessWidget{final String title,text;const Legal({super.key,required this.title,required this.text});@override Widget build(BuildContext c)=>shell('LEGAL INFORMATION',title,'Review before commercial launch.',card(Text(text)));}

const privacyText='WyBuild receives GitHub identity and authorized repository/build information needed to operate the service. Source code remains on GitHub except when a selected GitHub Actions workflow processes it. Application metadata may include projects, builds, releases and usage. Payment verification is handled by WyDev; WyBuild does not store card credentials. OAuth tokens are held in an encrypted HttpOnly server session.';
const termsText='WyBuild connects authorized GitHub repositories to isolated GitHub Actions workflows for builds and releases. You remain responsible for your source code, dependencies, licenses, credentials and configuration. Do not use WyBuild for unlawful software, malware or content you do not have rights to use. Build execution and artifact retention depend on GitHub Actions and configured workflow settings.';
