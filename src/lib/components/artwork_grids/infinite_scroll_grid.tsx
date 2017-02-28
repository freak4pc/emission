// 1. Get first layout pass of grid view so we have a total width and calculate the column width (componentDidMount?).
// 2. Possibly do artwork column layout now, as we can do so based just on the aspect ratio, assuming the text height
//    won't be too different between artworks.
// 3. Get artwork heights by either:
//    - calculating the item size upfront with aspect ratio and a static height for the text labels.
//    - leting the artwork component do a layout pass and calculate its own height based on the column width.
// 4. Update height of grid to encompass all items.

import * as React from "react"
import { Dimensions, ScrollView, StyleSheet, View } from "react-native"
import * as Relay from "react-relay"

import { LayoutEvent } from "../../system/events"
import Spinner from "../spinner"
import Artwork from "./artwork"

const PageSize = 10
const PageEndThreshold = 1000

/**
 * TODOs:
 * - currently all the code assumes column layout
 *   - do no invert aspect ratios in row layout
 * - deal with edge-cases when calculating in which section an artwork should go
 *   - see ARMasonryCollectionViewLayout for details on how to deal with last works sticking out
 *   - the calculation currently only takes into account the size of the image, not if e.g. the sale message is present
 */

interface Props extends ArtistRelayProps, GeneRelayProps {
  /** The direction for the grid, currently only 'column' is supported . */
  sectionDirection: string;

  /** The arity of the number of sections (e.g. columns) to show */
  sectionCount: number;

  /** The inset margin for the whole grid */
  sectionMargin: number;

  /** The per-item margin */
  itemMargin: number;

  /** The artist in question */
  artist: any;

  /** The gene in question */
  gene: any;

  /** The key to get artworks */
  queryKey: any;

  /** Filter for artist artworks */
  filter: any;

  /** Medium for filter artworks */
  medium: string;

  /** Price range for filter artworks */
  priceRange: any;

  /** Sort for filter artworks */
  sort: any;

  /** Relay */
  relay: any;

  /** A callback that is called once all artworks have been queried. */
  onComplete?: () => void;
}

interface State {
  sectionDimension: number
  completed: boolean
  fetchingNextPage: boolean
}

class InfiniteScrollArtworksGrid extends React.Component<Props, State> {
  static defaultProps = {
    sectionDirection: "column",
    sectionCount: Dimensions.get("window").width > 700 ? 3 : 2,
    sectionMargin: 20,
    itemMargin: 20,
  }

  private sentEndForContentLength: null | number

  constructor(props) {
    super(props)

    this.state = {
      sectionDimension: 0,
      completed: false,
      fetchingNextPage: false,
    }

    this.sentEndForContentLength = null
  }

  fetchNextPage() {
    if (this.state.fetchingNextPage || this.state.completed) {
      return
    }
    this.setState({ fetchingNextPage: true })
    this.props.relay.setVariables({
      totalSize: this.props.relay.variables.totalSize + PageSize,
    }, (readyState) => {
      if (readyState.done) {
        this.setState({ fetchingNextPage: false })
        if (!this.props[this.props.queryKey].artworks.pageInfo.hasNextPage && this.props.onComplete) {
          this.props.onComplete()
          this.setState({ completed: true })
        }
      }
    })
  }

  /** A simplified version of the Relay debugging logs for infinite scrolls */
  debugLog(query: string, response?: any, error?: any) {
    // tslint:disable:no-console
    if (__DEV__ && (global as any).originalXMLHttpRequest !== undefined) {
      const groupName = "Infinite scroll request"
      const c: any = console
      c.groupCollapsed(groupName, "color:" + (response ? "black" : "red") + ";")
      console.log("Query:\n", query)
      if (response) {
        console.log("Response:\n", response)
      }
      console.groupEnd()
      if (error) {
        console.error("Error:\n", error)
      }
    }
    // tslint:enable:no-console
  }

  onLayout = (event: LayoutEvent) => {
    const layout = event.nativeEvent.layout
    if (layout.width > 0) {
      // This is the sum of all margins in between sections, so do not count to the right of last column.
      const sectionMargins = this.props.sectionMargin * (this.props.sectionCount - 1)
      this.setState({
        sectionDimension: (layout.width - sectionMargins) / this.props.sectionCount
      })
    }
  }

  sectionedArtworks() {
    const sectionedArtworks: any[][] = []
    const sectionRatioSums: number[] = []
    const queryKey = this.props.queryKey
    const artworks = this.props[queryKey].artworks ? this.props[queryKey].artworks.edges : []

    for (let i = 0; i < this.props.sectionCount; i++) {
      sectionedArtworks.push([])
      sectionRatioSums.push(0)
    }
    for (const artwork of artworks) {
      // There are artworks without images and other ‘issues’. Like Force we’re just going to reject those for now.
      // See: https://github.com/artsy/eigen/issues/1667
      //
      if (artwork.image) {
        // Find section with lowest *inverted* aspect ratio sum, which is the shortest column.
        let lowestRatioSum = Number.MAX_VALUE // Start higher, so we always find a
        let sectionIndex: number | null = null
        for (let j = 0; j < sectionRatioSums.length; j++) {
          const ratioSum = sectionRatioSums[j]
          if (ratioSum < lowestRatioSum) {
            sectionIndex = j
            lowestRatioSum = ratioSum
          }
        }

        if (sectionIndex != null) {
          const section = sectionedArtworks[sectionIndex]
          section.push(artwork)

          // Keep track of total section aspect ratio
          const aspectRatio = artwork.image.aspect_ratio || 1 // Ensure we never divide by null/0
          // Invert the aspect ratio so that a lower value means a shorter section.
          sectionRatioSums[sectionIndex] += (1 / aspectRatio)
        }
      }
    }

    return sectionedArtworks
  }

  renderSections() {
    const spacerStyle = {
      height: this.props.itemMargin,
    }

    const queryKey = this.props.queryKey
    const artworks = this.props[queryKey].artworks ? this.props[queryKey].artworks.edges : []
    const sectionedArtworks = this.sectionedArtworks()
    const sections: JSX.Element[] = []
    for (let i = 0; i < this.props.sectionCount; i++) {
      const artworkComponents: JSX.Element[] = []
      for (let j = 0; j < sectionedArtworks[i].length; j++) {
        const artwork = sectionedArtworks[i][j]
        artworkComponents.push(
          <Artwork
            artwork={artwork}
            key={"artwork-" + j + "-" + artwork.__id}
          />)
        // Setting a marginBottom on the artwork component didn’t work, so using a spacer view instead.
        if (j < artworks.length - 1) {
          artworkComponents.push(
            <View style={spacerStyle} key={"spacer-" + j + "-" + artwork.__id} accessibilityLabel="Spacer View" />
          )
        }
      }

      const sectionSpecificStyle = {
        width: this.state.sectionDimension,
        marginRight: (i === this.props.sectionCount - 1 ? 0 : this.props.sectionMargin),
      }

      sections.push(
        <View style={[styles.section, sectionSpecificStyle]} key={i} accessibilityLabel={"Section " + i}>
          {artworkComponents}
        </View>
      )
    }
    return sections
  }

  // Lifted pretty much straight from RN’s ListView.js
  onScroll = (event) => {
    const scrollProperties = event.nativeEvent
    const contentLength = scrollProperties.contentSize.height
    if (contentLength !== this.sentEndForContentLength) {
      const offset = scrollProperties.contentOffset.y
      const visibleLength = scrollProperties.layoutMeasurement.height
      const distanceFromEnd = contentLength - visibleLength - offset
      if (distanceFromEnd < PageEndThreshold) {
        this.sentEndForContentLength = contentLength
        this.fetchNextPage()
      }
    }
  }

  render() {
    const artworks = this.state.sectionDimension ? this.renderSections() : null
    return (
      <ScrollView onScroll={this.onScroll}
                  scrollEventThrottle={50}
                  onLayout={this.onLayout}
                  scrollsToTop={false}
                  accessibilityLabel="Artworks ScrollView">
        <View style={styles.container} accessibilityLabel="Artworks Content View">
          {artworks}
        </View>
        {this.state.fetchingNextPage ? <Spinner style={styles.spinner} /> : null}
      </ScrollView>
    )
  }
}

interface Styles {
  container: ReactNative.ViewStyle,
  section: ReactNative.ViewStyle,
  spinner: ReactNative.ViewStyle,
}

const styles = StyleSheet.create<Styles>({
  container: {
    flexDirection: "row",
  },
  section: {
    flex: 1,
    flexDirection: "column",
  },
  spinner: {
    marginTop: 20,
  },
})

export default Relay.createContainer(InfiniteScrollArtworksGrid, {
  initialVariables: {
    totalSize: PageSize,
    filter: null,
  },
  fragments: {
    artist: () => Relay.QL`
      fragment on Artist {
        artworks: artworks_connection(sort: partner_updated_at_desc, filter: $filter, first: $totalSize) {
          pageInfo {
            hasNextPage
          }
          edges {
            node {
              image {
                id
              }
              ${Artwork.getFragment("artwork")}
            }
          }
        }
      }
    `,
  },
})

interface ArtistRelayProps {
  artist: {
    artworks_connection: {
      pageInfo: {
        hasNextPage: boolean,
      },
      edges: Array<{
        node: {
          image: {
            id: string | null,
          } | null,
        } | null,
      }>,
    } | null,
  },
}

const GeneInfiniteScrollContainer = Relay.createContainer(InfiniteScrollArtworksGrid, {
  initialVariables: {
    totalSize: PageSize,
    medium: "*",
    priceRange: "*-*",
    sort: "-partner_updated_at",
  },
  fragments: {
    gene: () => Relay.QL`
      fragment on Gene {
        artworks: artworks_connection(sort: $sort,
                                      price_range: $priceRange,
                                      medium: $medium,
                                      first: $totalSize,
                                      for_sale: true) {
          pageInfo {
            hasNextPage
          }
          edges {
            node {
              image {
                id
              }
              ${Artwork.getFragment("artwork")}
            }
          }
        }
      }
    `,
  },
})

export { GeneInfiniteScrollContainer }

interface GeneRelayProps {
  gene: {
    artworks_connection: {
      pageInfo: {
        hasNextPage: boolean,
      },
      edges: Array<{
        node: {
          image: {
            id: string | null,
          } | null,
        } | null,
      }>,
    } | null,
  },
}
