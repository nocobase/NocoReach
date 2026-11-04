## Playbooks: built-in step instructions that hold for a CMS article

- The built-in instructions of Write blog post, New docs page, Write release notes, Technical fix and its Write plan step no longer name a blog folder, frontmatter, the navigation, files or the repository, which do not apply when the task writes an article in a CMS such as NocoBase CMS. They name what to write instead, such as the title, summary, address and body, the same for a website repository and an article.
- When the change goes to the website repository, the Agent still puts a new page where pages of its kind are, fills in the details they all have (such as the date and tags in the frontmatter) and adds it to the navigation when they are listed there; this is now part of the Agent's rules for changing a repository.
- A task already started from an unedited built-in playbook gives the Agent its step instruction in the current wording on the next run, the same text View steps shows.
