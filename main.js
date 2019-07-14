const Collection = require('./Collection')

const collectors = require('./collectors')

const imdb = new Collection({
  url: 'https://www.imdb.com/chart/top',
  item: {
    selector: 'table[data-caller-name="chart-top250movie"] tbody tr',
    fields: ({ resource }) => ({
      title: {
        selector: '.titleColumn a',
        collect: collectors.text()
      },
      thumbnail: {
        selector: '.posterColumn img',
        collect: collectors.attr('src')
      },
      link: {
        selector: '.titleColumn a',
        collect: collectors.attr('href')
      },
      description: {
        from: resource('itemPage', '$id'),
        selector: '.heroic-overview .plot_summary .summary_text',
        collect: collectors.text({
          trim: true
        })
      }
    }),
    computed: {
      id: {
        use: ['link'],
        handle ({ link }) {
          const match = link.match(/^https?:\/\/www\.imdb\.com\/title\/([^/]+)\//)
 
          return match[1]
        }
      }
    },
    resources: {
      itemPage: {
        url: 'https://www.imdb.com/title/:id'
      }
    }
  }
})

;(async function () {
  await imdb.parse()
  
  console.log(imdb.items[0])
})()
