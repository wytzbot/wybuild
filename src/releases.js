export function releaseNotesFromCommits(commits=[]){return commits.map(c=>`- ${c.message||c.title||"Update"}`).join("\n")||"- Maintenance updates";}
